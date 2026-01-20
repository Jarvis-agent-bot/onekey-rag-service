from __future__ import annotations

import re
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from analyzer import TxParser, CalldataDecoder, CalldataContext, TxSimulator, SimulationRequest, SignatureParser
from analyzer.schemas import TxParseResult, ExplanationResult as AnalyzerExplanation
from clients import RAGClient
from config import Settings, get_settings
from app_logging import Tracer, get_logger, bind_context, clear_context
from storage import RedisCache, get_db_context, ParseLog
from integrations import SignatureDB

from .schemas import (
    TxAnalyzeRequest,
    TxAnalyzeResponse,
    TxParseRequest,
    TxParseResponse,
    ExplanationResult,
    ChainInfo,
    HealthResponse,
    DecodeCalldataRequest,
    DecodeCalldataResponse,
    SimulateRequest,
    SimulateResponse,
    DecodeSignatureRequest,
    DecodeSignatureResponse,
    SmartAnalyzeRequest,
    SmartAnalyzeResponse,
)

logger = get_logger(__name__)
router = APIRouter()


def get_parser(request: Request) -> TxParser:
    """获取解析器实例"""
    return request.app.state.parser


def get_rag_client(request: Request) -> RAGClient:
    """获取 RAG 客户端实例"""
    return request.app.state.rag_client


def get_cache(request: Request) -> RedisCache | None:
    """获取缓存实例"""
    return getattr(request.app.state, "cache", None)


@router.get("/healthz", response_model=HealthResponse)
async def health_check(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """健康检查"""
    dependencies: dict[str, str] = {}

    # 检查 RAG 服务
    rag_client = get_rag_client(request)
    if rag_client:
        try:
            rag_ok = await rag_client.health_check()
            dependencies["rag"] = "ok" if rag_ok else "unhealthy"
        except Exception:
            dependencies["rag"] = "unhealthy"
    else:
        dependencies["rag"] = "not_configured"

    # 检查 Redis
    cache = get_cache(request)
    if cache:
        try:
            await cache.set("health_check", {"status": "ok"}, 10)
            dependencies["redis"] = "ok"
        except Exception:
            dependencies["redis"] = "unhealthy"
    else:
        dependencies["redis"] = "not_configured"

    # 确定整体状态
    status = "ok"
    if any(v == "unhealthy" for v in dependencies.values()):
        status = "degraded"

    return HealthResponse(
        status=status,
        version="1.0.0",
        dependencies=dependencies,
    )


@router.get("/v1/chains", response_model=list[ChainInfo])
async def list_chains(settings: Settings = Depends(get_settings)) -> list[ChainInfo]:
    """获取支持的链列表"""
    chain_configs = settings.get_chain_configs()
    return [
        ChainInfo(
            chain_id=config.chain_id,
            name=config.name,
            native_token=config.native_token,
            explorer_url=config.explorer_base_url.replace("/api", ""),
        )
        for config in chain_configs.values()
    ]


@router.post("/v1/tx/parse", response_model=TxParseResponse)
async def parse_transaction(
    req: TxParseRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TxParseResponse:
    """解析交易（不调用 RAG）"""
    tracer = Tracer(chain_id=req.chain_id, tx_hash=req.tx_hash)
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id, tx_hash=req.tx_hash)

    try:
        parser = get_parser(request)
        parse_result = await parser.parse(
            chain_id=req.chain_id,
            tx_hash=req.tx_hash,
            tracer=tracer,
        )

        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="success",
            parse_result=parse_result.to_dict(),
            timings=tracer.get_timings(),
        )

    except ValueError as e:
        logger.warning("parse_error", error=str(e))
        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=str(e),
            timings=tracer.get_timings(),
        )
    except Exception as e:
        logger.exception("parse_exception", error=str(e))
        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=f"Internal error: {str(e)}",
            timings=tracer.get_timings(),
        )
    finally:
        clear_context()


@router.post("/v1/tx/analyze", response_model=TxAnalyzeResponse)
async def analyze_transaction(
    req: TxAnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TxAnalyzeResponse:
    """分析交易（一站式 API）"""
    tracer = Tracer(chain_id=req.chain_id, tx_hash=req.tx_hash)
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id, tx_hash=req.tx_hash)

    parse_result: TxParseResult | None = None
    explanation: ExplanationResult | None = None
    error: str | None = None
    status = "success"

    try:
        # 1. 解析交易
        parser = get_parser(request)
        parse_result = await parser.parse(
            chain_id=req.chain_id,
            tx_hash=req.tx_hash,
            tracer=tracer,
        )

        # 2. 调用 RAG 生成解释（如果需要）
        if req.options.include_explanation:
            rag_client = get_rag_client(request)
            if rag_client:
                with tracer.step("call_rag", {"model": settings.rag_model}) as step:
                    try:
                        rag_result = await rag_client.explain(
                            parse_result=parse_result.to_dict(),
                            language=req.options.language,
                            trace_id=tracer.trace_id,
                        )
                        explanation = ExplanationResult(
                            summary=rag_result.get("summary", ""),
                            risk_level=rag_result.get("risk_level", "unknown"),
                            risk_reasons=rag_result.get("risk_reasons", []),
                            actions=rag_result.get("actions", []),
                            sources=rag_result.get("sources", []),
                        )
                        step.set_output({
                            "risk_level": explanation.risk_level,
                            "sources_count": len(explanation.sources),
                        })
                    except Exception as e:
                        logger.warning("rag_error", error=str(e))
                        step.set_output({"error": str(e)})
                        status = "partial"
                        error = f"RAG error: {str(e)}"
            else:
                status = "partial"
                error = "RAG client not configured"

    except ValueError as e:
        logger.warning("analyze_error", error=str(e))
        status = "failed"
        error = str(e)
    except Exception as e:
        logger.exception("analyze_exception", error=str(e))
        status = "failed"
        error = f"Internal error: {str(e)}"

    # 3. 记录日志（如果启用）
    if settings.trace_store_db:
        try:
            _save_parse_log(
                tracer=tracer,
                request=req,
                parse_result=parse_result,
                status=status,
                error=error,
            )
        except Exception as e:
            logger.warning("save_log_error", error=str(e))

    # 4. 构建响应
    response = TxAnalyzeResponse(
        trace_id=tracer.trace_id,
        status=status,
        parse_result=parse_result.to_dict() if parse_result else None,
        explanation=explanation,
        timings=tracer.get_timings(),
        error=error,
    )

    # 5. 包含 trace 日志（如果需要）
    if req.options.include_trace:
        response.trace_log = tracer.get_steps_list()

    clear_context()
    return response


# ==================== 新增 API 端点 ====================

def get_calldata_decoder(request: Request) -> CalldataDecoder:
    """获取 Calldata 解码器实例"""
    parser = get_parser(request)
    # 使用 parser 自带的 signature_db
    signature_db = getattr(parser, "signature_db", None)
    return CalldataDecoder(parser.abi_decoder, signature_db)


def get_simulator(request: Request) -> TxSimulator:
    """获取交易模拟器实例"""
    parser = get_parser(request)
    return TxSimulator(parser.rpc_clients)


@router.post("/v1/decode", response_model=DecodeCalldataResponse)
async def decode_calldata(
    req: DecodeCalldataRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> DecodeCalldataResponse:
    """
    解码 Calldata

    解析未签名/未发送交易的 calldata 数据，返回：
    - 函数名称和签名
    - 解码后的参数
    - 行为类型分析
    - 风险评估
    """
    tracer = Tracer(chain_id=req.chain_id, tx_hash="decode")
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id)

    try:
        decoder = get_calldata_decoder(request)

        # 构建上下文
        context = CalldataContext(
            chain_id=req.chain_id,
            to_address=req.to_address,
            from_address=req.from_address,
            value=req.value,
        )

        # 如果有目标地址，尝试获取 ABI
        abi = None
        if req.to_address:
            parser = get_parser(request)
            with tracer.step("fetch_abi", {"address": req.to_address}) as step:
                try:
                    abi = await parser._get_abi(req.chain_id, req.to_address)
                    step.set_output({"has_abi": abi is not None})
                except Exception as e:
                    step.set_output({"error": str(e)})

        # 解码 calldata
        with tracer.step("decode_calldata", {"length": len(req.calldata)}) as step:
            result = await decoder.decode(req.calldata, context, abi)
            step.set_output({
                "function": result.function_name,
                "behavior": result.behavior_type,
                "risk_level": result.risk_level,
            })

        # 格式化显示
        formatted = decoder.format_decoded_for_display(result)

        return DecodeCalldataResponse(
            trace_id=tracer.trace_id,
            status="success",
            result=result.to_dict(),
            formatted=formatted,
            timings=tracer.get_timings(),
        )

    except Exception as e:
        logger.exception("decode_error", error=str(e))
        return DecodeCalldataResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=str(e),
            timings=tracer.get_timings(),
        )
    finally:
        clear_context()


@router.post("/v1/simulate", response_model=SimulateResponse)
async def simulate_transaction(
    req: SimulateRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SimulateResponse:
    """
    模拟交易执行

    在发送交易前模拟执行，预测：
    - 交易是否会成功
    - Gas 消耗估算
    - 资产变化预览
    - 风险提示
    """
    tracer = Tracer(chain_id=req.chain_id, tx_hash="simulate")
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id)

    try:
        simulator = get_simulator(request)

        sim_request = SimulationRequest(
            chain_id=req.chain_id,
            from_address=req.from_address,
            to_address=req.to_address,
            data=req.data,
            value=req.value,
            gas_limit=req.gas_limit,
        )

        with tracer.step("simulate", {"to": req.to_address}) as step:
            result = await simulator.simulate(sim_request)
            step.set_output({
                "success": result.success,
                "gas_used": result.gas_used,
                "transfers_count": len(result.token_transfers),
            })

        return SimulateResponse(
            trace_id=tracer.trace_id,
            status="success" if result.success else "failed",
            result=result.to_dict(),
            error=result.error_message if not result.success else None,
            timings=tracer.get_timings(),
        )

    except Exception as e:
        logger.exception("simulate_error", error=str(e))
        return SimulateResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=str(e),
            timings=tracer.get_timings(),
        )
    finally:
        clear_context()


@router.post("/v1/signature/decode", response_model=DecodeSignatureResponse)
async def decode_signature(
    req: DecodeSignatureRequest,
    request: Request,
) -> DecodeSignatureResponse:
    """
    解析签名数据

    解析 EIP-712 签名请求、Permit 签名等，返回：
    - 签名类型识别
    - 消息内容解析
    - 授权详情（如果是 Permit）
    - 风险评估
    """
    tracer = Tracer(chain_id=req.chain_id or 1, tx_hash="signature")
    bind_context(trace_id=tracer.trace_id)

    try:
        parser = SignatureParser()

        with tracer.step("parse_signature") as step:
            result = parser.parse(req.data)
            step.set_output({
                "type": result.signature_type,
                "primary_type": result.primary_type,
                "risk_level": result.risk_level,
            })

        # 生成人类可读摘要
        summary = parser.get_human_readable_summary(result)

        return DecodeSignatureResponse(
            trace_id=tracer.trace_id,
            status="success",
            result=result.to_dict(),
            summary=summary,
        )

    except Exception as e:
        logger.exception("signature_decode_error", error=str(e))
        return DecodeSignatureResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=str(e),
        )
    finally:
        clear_context()


@router.post("/v1/smart-analyze", response_model=SmartAnalyzeResponse)
async def smart_analyze(
    req: SmartAnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SmartAnalyzeResponse:
    """
    智能分析 - 自动识别输入类型

    自动识别输入是：
    - 交易哈希 (0x + 64字符)
    - Calldata (0x + 任意长度)
    - 签名数据 (JSON 格式)

    并调用相应的分析方法
    """
    tracer = Tracer(chain_id=req.chain_id, tx_hash="smart")
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id)

    input_data = req.input.strip()
    input_type = _detect_input_type(input_data)

    response = SmartAnalyzeResponse(
        trace_id=tracer.trace_id,
        input_type=input_type,
        status="success",
    )

    try:
        if input_type == "tx_hash":
            # 交易哈希分析
            parser = get_parser(request)
            parse_result = await parser.parse(
                chain_id=req.chain_id,
                tx_hash=input_data,
                tracer=tracer,
            )
            response.tx_result = parse_result.to_dict()

            # 可选：调用 RAG
            if req.options.include_explanation:
                rag_client = get_rag_client(request)
                if rag_client:
                    try:
                        rag_result = await rag_client.explain(
                            parse_result=parse_result.to_dict(),
                            language=req.options.language,
                            trace_id=tracer.trace_id,
                        )
                        response.explanation = ExplanationResult(
                            summary=rag_result.get("summary", ""),
                            risk_level=rag_result.get("risk_level", "unknown"),
                            risk_reasons=rag_result.get("risk_reasons", []),
                            actions=rag_result.get("actions", []),
                            sources=rag_result.get("sources", []),
                        )
                    except Exception as e:
                        logger.warning("rag_error", error=str(e))

        elif input_type == "calldata":
            # Calldata 解码
            decoder = get_calldata_decoder(request)
            context = CalldataContext(
                chain_id=req.chain_id,
                to_address=req.context.get("to_address"),
                from_address=req.context.get("from_address"),
                value=req.context.get("value", "0"),
            )

            # 如果有目标地址，尝试获取 ABI
            abi = None
            to_address = req.context.get("to_address")
            if to_address:
                parser = get_parser(request)
                with tracer.step("fetch_abi", {"address": to_address}) as step:
                    try:
                        abi = await parser._get_abi(req.chain_id, to_address)
                        step.set_output({"has_abi": abi is not None})
                    except Exception as e:
                        step.set_output({"error": str(e)})

            result = await decoder.decode(input_data, context, abi)
            response.decode_result = result.to_dict()

            # 可选：调用 RAG 生成解释
            if req.options.include_explanation:
                rag_client = get_rag_client(request)
                if rag_client:
                    try:
                        # 构建类似交易的 parse_result 用于 RAG 分析
                        calldata_parse_result = {
                            "method": {
                                "name": result.function_name,
                                "signature": result.function_signature,
                                "selector": result.selector,
                                "inputs": result.inputs,
                            },
                            "behavior": {
                                "type": result.behavior_type,
                            },
                            "risk_flags": [rf.to_dict() if hasattr(rf, 'to_dict') else rf.__dict__ for rf in result.risk_flags],
                            "chain_id": req.chain_id,
                            "to": to_address,
                            "from": req.context.get("from_address"),
                            "value": req.context.get("value", "0"),
                        }
                        rag_result = await rag_client.explain(
                            parse_result=calldata_parse_result,
                            language=req.options.language,
                            trace_id=tracer.trace_id,
                        )
                        response.explanation = ExplanationResult(
                            summary=rag_result.get("summary", ""),
                            risk_level=rag_result.get("risk_level", "unknown"),
                            risk_reasons=rag_result.get("risk_reasons", []),
                            actions=rag_result.get("actions", []),
                            sources=rag_result.get("sources", []),
                        )
                    except Exception as e:
                        logger.warning("rag_error_calldata", error=str(e))

        elif input_type == "signature":
            # 签名解析
            sig_parser = SignatureParser()
            try:
                sig_data = json.loads(input_data)
            except json.JSONDecodeError:
                sig_data = input_data
            result = sig_parser.parse(sig_data)
            response.signature_result = result.to_dict()

            # 可选：调用 RAG 生成解释
            if req.options.include_explanation:
                rag_client = get_rag_client(request)
                if rag_client:
                    try:
                        # 构建 parse_result 用于 RAG 分析
                        sig_parse_result = {
                            "signature_type": result.signature_type,
                            "primary_type": result.primary_type,
                            "domain": result.domain,
                            "message": result.message,
                            "risk_level": result.risk_level,
                            "risk_reasons": result.risk_reasons,
                            "behavior": {
                                "type": "signature_request",
                            },
                            "chain_id": req.chain_id,
                        }
                        rag_result = await rag_client.explain(
                            parse_result=sig_parse_result,
                            language=req.options.language,
                            trace_id=tracer.trace_id,
                        )
                        response.explanation = ExplanationResult(
                            summary=rag_result.get("summary", ""),
                            risk_level=rag_result.get("risk_level", "unknown"),
                            risk_reasons=rag_result.get("risk_reasons", []),
                            actions=rag_result.get("actions", []),
                            sources=rag_result.get("sources", []),
                        )
                    except Exception as e:
                        logger.warning("rag_error_signature", error=str(e))

        else:
            response.status = "failed"
            response.error = "Unable to determine input type"

    except Exception as e:
        logger.exception("smart_analyze_error", error=str(e))
        response.status = "failed"
        response.error = str(e)

    response.timings = tracer.get_timings()
    clear_context()
    return response


def _detect_input_type(input_data: str) -> str:
    """检测输入类型"""
    input_data = input_data.strip()

    # 尝试解析为 JSON (签名数据)
    if input_data.startswith("{"):
        try:
            data = json.loads(input_data)
            if "domain" in data and "message" in data:
                return "signature"
        except json.JSONDecodeError:
            pass

    # 检查是否是十六进制数据
    if input_data.startswith("0x"):
        hex_part = input_data[2:]
        if re.match(r"^[a-fA-F0-9]+$", hex_part):
            # 交易哈希: 64 字符
            if len(hex_part) == 64:
                return "tx_hash"
            # Calldata: 至少 8 字符 (4 字节选择器)
            elif len(hex_part) >= 8:
                return "calldata"

    return "unknown"


def _save_parse_log(
    tracer: Tracer,
    request: TxAnalyzeRequest,
    parse_result: TxParseResult | None,
    status: str,
    error: str | None,
) -> None:
    """保存解析日志到数据库"""
    try:
        with get_db_context() as db:
            timings = tracer.get_timings()

            log = ParseLog(
                trace_id=tracer.trace_id,
                chain_id=request.chain_id,
                tx_hash=request.tx_hash,
                request_options=request.options.model_dump(),
                status=status,
                behavior_type=parse_result.behavior.type if parse_result else None,
                risk_flags=[rf.model_dump() for rf in parse_result.risk_flags] if parse_result else None,
                total_ms=timings.get("total_ms"),
                parse_ms=sum(v for k, v in timings.items() if k != "total_ms" and k != "call_rag_ms"),
                rag_ms=timings.get("call_rag_ms"),
                error_message=error,
                trace_steps=tracer.get_steps_list(),
            )
            db.add(log)
            db.commit()
    except Exception as e:
        logger.warning("save_parse_log_error", error=str(e))
