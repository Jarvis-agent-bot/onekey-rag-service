from __future__ import annotations

from typing import Any

from config import Settings, ChainConfig
from integrations import RPCClient, EtherscanClient, SignatureDB
from integrations.etherscan_client import EtherscanError
from integrations.contract_registry import ContractRegistry, ContractInfo, get_contract_registry
from app_logging import Tracer, get_logger
from storage import RedisCache

from .abi_decoder import ABIDecoder
from .event_classifier import EventClassifier
from .behavior_analyzer import BehaviorAnalyzer
from .risk_detector import RiskDetector
from .asset_predictor import AssetPredictor, get_asset_predictor
from .schemas import (
    TxParseResult,
    DecodedMethod,
    DecodedEvent,
    BehaviorResult,
    GasInfo,
    SourcesInfo,
)

logger = get_logger(__name__)


class TxParser:
    """交易解析器"""

    VERSION = "1.1.0"

    def __init__(
        self,
        settings: Settings,
        cache: RedisCache | None = None,
    ):
        self.settings = settings
        self.cache = cache
        self.chain_configs = settings.get_chain_configs()

        # 初始化组件
        self.abi_decoder = ABIDecoder()
        self.event_classifier = EventClassifier()
        self.behavior_analyzer = BehaviorAnalyzer()
        self.risk_detector = RiskDetector()
        self.signature_db = SignatureDB()
        self.contract_registry = get_contract_registry()
        self.asset_predictor = get_asset_predictor()

        # 初始化 RPC 客户端映射 (用于模拟器)
        self.rpc_clients: dict[int, RPCClient] = {}

    def _get_chain_config(self, chain_id: int) -> ChainConfig:
        """获取链配置"""
        config = self.chain_configs.get(chain_id)
        if not config:
            raise ValueError(f"Unsupported chain_id: {chain_id}")
        return config

    def _get_rpc_client(self, chain_config: ChainConfig) -> RPCClient:
        """获取 RPC 客户端"""
        return RPCClient(
            rpc_url=chain_config.rpc_url,
            timeout=self.settings.rpc_timeout_s,
        )

    def _get_etherscan_client(self, chain_config: ChainConfig) -> EtherscanClient:
        """获取 Etherscan 客户端"""
        return EtherscanClient(
            base_url=chain_config.explorer_base_url,
            api_key=chain_config.explorer_api_key,
            chain_id=chain_config.chain_id,
            rate_limit_per_min=self.settings.etherscan_rate_limit_per_min,
        )

    def _find_best_signature_match(
        self,
        calldata: str,
        signatures: list[str],
    ) -> dict[str, Any] | None:
        """
        智能签名匹配：尝试所有候选签名，选择最佳匹配

        策略：
        1. 尝试用每个签名解码 calldata
        2. 过滤出能成功解码的签名
        3. 根据匹配度评分选择最佳结果

        Args:
            calldata: 原始 calldata
            signatures: 候选签名列表

        Returns:
            解码结果字典或 None
        """
        # 已知的高优先级协议函数
        HIGH_PRIORITY_FUNCTIONS = {
            "withdraw": 10, "supply": 10, "borrow": 10, "repay": 10,
            "deposit": 8, "transfer": 10, "approve": 10, "transferFrom": 10,
            "swapExactTokensForTokens": 7, "swapExactETHForTokens": 7,
            "addLiquidity": 7, "removeLiquidity": 5,
        }

        valid_matches: list[tuple[dict, int]] = []

        for sig in signatures:
            try:
                decoded = self.abi_decoder.decode_function_input(calldata, signature=sig)
                if decoded and decoded.get("name"):
                    func_name = decoded.get("name", "")
                    inputs = decoded.get("inputs", [])

                    # 计算匹配分数
                    param_score = max(0, 20 - len(inputs) * 2)
                    priority_score = HIGH_PRIORITY_FUNCTIONS.get(func_name, 0)

                    if "WithPermit" in func_name or "permit" in func_name.lower():
                        priority_score -= 5

                    total_score = param_score + priority_score
                    valid_matches.append((decoded, total_score))
            except Exception:
                continue

        if not valid_matches:
            return None

        # 按分数排序，选择最高分的
        valid_matches.sort(key=lambda x: x[1], reverse=True)
        return valid_matches[0][0]

    async def _get_abi(
        self,
        chain_id: int,
        address: str,
        tracer: Tracer | None = None,
    ) -> tuple[list[dict[str, Any]] | None, str, str, ContractInfo | None]:
        """
        获取合约 ABI

        ABI 获取优先级:
        1. 本地合约注册表 (已知协议)
        2. 缓存 (Redis)
        3. Etherscan API (链上验证)

        Args:
            chain_id: 链 ID
            address: 合约地址
            tracer: 可选的追踪器

        Returns:
            (ABI 列表, ABI 来源, 参考链接, 合约信息) 元组
        """
        abi = None
        abi_source = "unknown"
        abi_ref = ""
        contract_info: ContractInfo | None = None

        # 1. 先检查本地合约注册表 (已知协议优先)
        contract_info = self.contract_registry.identify_contract(chain_id, address)
        if contract_info:
            local_abi = self.contract_registry.get_local_abi(contract_info)
            if local_abi:
                logger.debug(
                    "abi_from_local_registry",
                    address=address,
                    protocol=contract_info.protocol,
                    name=contract_info.name,
                )
                return local_abi, "local_registry", f"local:{contract_info.protocol}", contract_info

        # 2. 检查缓存
        if self.cache:
            cached_abi = await self.cache.get_abi(chain_id, address)
            if cached_abi:
                abi = cached_abi.get("abi")
                if abi:
                    abi_source = cached_abi.get("source", "cache")
                    abi_ref = cached_abi.get("source_url", "")
                    logger.debug("abi_from_cache", address=address, source=abi_source)
                    return abi, abi_source, abi_ref, contract_info

        # 3. 从 Etherscan 获取
        try:
            chain_config = self._get_chain_config(chain_id)
            etherscan = self._get_etherscan_client(chain_config)
            abi = await etherscan.get_abi(address)
            if abi:
                abi_source = "etherscan"
                abi_ref = f"{chain_config.explorer_base_url}?module=contract&action=getabi&address={address}"

                # 缓存 ABI
                if self.cache:
                    await self.cache.set_abi(
                        chain_id,
                        address,
                        {"abi": abi, "source": abi_source, "source_url": abi_ref},
                        self.settings.abi_cache_ttl_seconds,
                    )
                logger.debug("abi_from_etherscan", address=address)
                return abi, abi_source, abi_ref, contract_info
        except Exception as e:
            logger.warning("get_abi_error", address=address, error=str(e))

        return None, "none", "", contract_info

    async def parse(
        self,
        chain_id: int,
        tx_hash: str,
        tracer: Tracer | None = None,
    ) -> TxParseResult:
        """解析交易"""
        if tracer is None:
            tracer = Tracer(chain_id=chain_id, tx_hash=tx_hash)

        # 检查缓存
        if self.cache:
            with tracer.step("check_cache", {"chain_id": chain_id, "tx_hash": tx_hash}) as step:
                cached = await self.cache.get_parse_result(chain_id, tx_hash)
                if cached:
                    step.set_output({"cache_hit": True})
                    logger.info("parse_cache_hit", chain_id=chain_id, tx_hash=tx_hash)
                    return TxParseResult(**cached)
                step.set_output({"cache_hit": False})

        chain_config = self._get_chain_config(chain_id)
        rpc = self._get_rpc_client(chain_config)
        etherscan = self._get_etherscan_client(chain_config)

        # 1. 获取交易详情
        with tracer.step("fetch_transaction", {"tx_hash": tx_hash}) as step:
            tx = await rpc.get_transaction_by_hash(tx_hash)
            if not tx:
                raise ValueError(f"Transaction not found: {tx_hash}")
            step.set_output({
                "block_number": tx.get("blockNumber"),
                "from": tx.get("from"),
                "to": tx.get("to"),
            })

        # 2. 获取交易收据
        with tracer.step("fetch_receipt", {"tx_hash": tx_hash}) as step:
            receipt = await rpc.get_transaction_receipt(tx_hash)
            if not receipt:
                raise ValueError(f"Receipt not found: {tx_hash}")
            logs = receipt.get("logs", [])
            step.set_output({
                "status": receipt.get("status"),
                "logs_count": len(logs),
                "gas_used": receipt.get("gasUsed"),
            })

        # 3. 获取 ABI (使用新的优先级: 本地注册表 → 缓存 → Etherscan)
        to_address = tx.get("to")
        abi = None
        abi_source = "unknown"
        abi_ref = ""
        abi_error = ""
        abi_status = "skipped"
        abi_reason = ""
        contract_info: ContractInfo | None = None

        if to_address:
            with tracer.step("fetch_abi", {"contract": to_address}) as step:
                try:
                    abi, abi_source, abi_ref, contract_info = await self._get_abi(
                        chain_id, to_address, tracer
                    )
                    if abi:
                        abi_status = "ok"
                        step.set_output({
                            "source": abi_source,
                            "method_count": len(abi),
                            "protocol": contract_info.protocol if contract_info else None,
                        })
                    else:
                        abi_status = "unverified"
                        abi_reason = "not_verified"
                        step.set_output({"source": "none", "reason": abi_reason})
                except Exception as e:
                    logger.warning("fetch_abi_error", address=to_address, error=str(e))
                    abi_status = "error"
                    abi_error = str(e)
                    if isinstance(e, EtherscanError):
                        abi_reason = e.code or "api_error"
                    step.set_output({"source": "none", "error": abi_error})

            # 缓存 RPC 客户端 (用于模拟器)
            if chain_id not in self.rpc_clients:
                self.rpc_clients[chain_id] = rpc
        else:
            abi_reason = "contract_creation"

        # 4. 解码方法 (优化的优先级逻辑)
        input_data = tx.get("input", "0x")
        method: DecodedMethod | None = None
        method_status = "unknown"
        method_reason = ""
        method_selector = input_data[:10] if input_data and len(input_data) >= 10 else ""
        signature_checked = False
        signature_found = False
        possible_signatures: list[str] = []

        if input_data and input_data != "0x":
            with tracer.step("decode_input", {"selector": method_selector}) as step:
                decoded = None
                selector = input_data[:10].lower()

                # Step 1: 尝试从 ABI 解码
                if abi:
                    decoded = self.abi_decoder.decode_function_input(input_data, abi=abi)
                    if decoded and decoded.get("name"):
                        logger.debug("decoded_with_abi", function=decoded.get("name"), source=abi_source)

                # Step 2: 如果 ABI 解码失败，立即尝试 4bytes (修正时机)
                if not decoded or not decoded.get("name"):
                    signature_checked = True
                    with tracer.step("4bytes_lookup", {"selector": selector}) as sig_step:
                        signatures = await self.signature_db.lookup_signature(selector)
                        if signatures:
                            signature_found = True
                            possible_signatures = signatures

                            # 尝试用每个签名解码，选择最佳匹配
                            best_match = self._find_best_signature_match(input_data, signatures)
                            if best_match:
                                decoded = best_match
                                abi_source = "4bytes"
                                sig_step.set_output({
                                    "found": True,
                                    "candidates": len(signatures),
                                    "selected": decoded.get("name"),
                                })
                            else:
                                sig_step.set_output({
                                    "found": True,
                                    "candidates": len(signatures),
                                    "decode_failed": True,
                                })
                        else:
                            sig_step.set_output({"found": False})

                if decoded and decoded.get("name"):
                    method = DecodedMethod(
                        signature=decoded.get("signature", ""),
                        selector=decoded.get("selector", selector),
                        name=decoded.get("name", ""),
                        inputs=decoded.get("inputs", []),
                        abi_source=abi_source,
                        abi_ref=abi_ref,
                    )
                    method_status = "decoded"
                    step.set_output({
                        "method": method.name,
                        "selector": method.selector,
                        "args_count": len(method.inputs),
                        "source": abi_source,
                    })
                else:
                    method_status = "failed"
                    if not abi and not signature_found:
                        method_reason = "abi_and_signature_missing"
                    elif not abi:
                        method_reason = "abi_missing"
                    elif signature_checked and not signature_found:
                        method_reason = "signature_not_found"
                    else:
                        method_reason = "decode_failed"
                    step.set_output({
                        "decoded": False,
                        "reason": method_reason,
                        "possible_signatures": possible_signatures[:3],
                    })
        else:
            method_status = "none"
            method_reason = "empty_input"

        # 5. 解码事件
        events: list[DecodedEvent] = []
        events_status = "unknown"
        events_reason = ""

        if logs:
            with tracer.step("decode_events", {"logs_count": len(logs)}) as step:
                decoded_events = []
                for log in logs:
                    decoded = self.abi_decoder.decode_log(log, abi=abi)
                    if decoded:
                        decoded_events.append(decoded)

                events = self.event_classifier.classify_events(logs, decoded_events)

                if events:
                    events_status = "decoded"
                else:
                    events_status = "failed"
                    events_reason = "abi_missing" if not abi else "decode_failed"
                event_names = [e.name for e in events if e.name]
                step.set_output({
                    "decoded_count": len(events),
                    "events": list(set(event_names)),
                })
        else:
            events_status = "none"
            events_reason = "no_logs"

        # 6. 分析行为
        with tracer.step("analyze_behavior") as step:
            behavior = self.behavior_analyzer.analyze(
                method=method,
                events=events,
                to_address=to_address,
                value=tx.get("value", "0x0"),
                input_data=input_data,
            )
            step.set_output({
                "type": behavior.type,
                "confidence": behavior.confidence,
                "evidence_count": len(behavior.evidence),
            })

        # 7. 检测风险
        with tracer.step("detect_risks") as step:
            risk_flags = self.risk_detector.detect(
                method=method,
                events=events,
                behavior=behavior,
                to_address=to_address,
                value=tx.get("value", "0x0"),
                from_address=tx.get("from", ""),
            )
            step.set_output({
                "risk_count": len(risk_flags),
                "risk_types": [r.type for r in risk_flags],
            })

        # 8. 构建结果
        block_number = tx.get("blockNumber")
        if isinstance(block_number, str):
            block_number = int(block_number, 16)

        gas_used = receipt.get("gasUsed", "0x0")
        gas_price = tx.get("gasPrice", "0x0")

        if isinstance(gas_used, str):
            gas_used = int(gas_used, 16)
        if isinstance(gas_price, str):
            gas_price = int(gas_price, 16)

        fee_paid = gas_used * gas_price if gas_used and gas_price else 0

        value = tx.get("value", "0x0")
        if isinstance(value, str):
            value = str(int(value, 16))

        status = "success" if receipt.get("status") == "0x1" or receipt.get("status") == 1 else "failed"

        diagnostics = {
            "abi": {
                "status": abi_status,
                "reason": abi_reason,
                "source": abi_source,
                "ref": abi_ref,
                "error": abi_error,
            },
            "method": {
                "status": method_status,
                "reason": method_reason,
                "selector": method_selector,
            },
            "events": {
                "status": events_status,
                "reason": events_reason,
                "logs_count": len(logs),
            },
        }

        result = TxParseResult(
            version=self.VERSION,
            tx_hash=tx_hash,
            chain_id=chain_id,
            block_number=block_number,
            timestamp=None,  # 需要从区块获取
            **{"from": tx.get("from", "")},
            to=to_address,
            nonce=int(tx.get("nonce", "0x0"), 16) if isinstance(tx.get("nonce"), str) else tx.get("nonce"),
            tx_type=int(tx.get("type", "0x0"), 16) if isinstance(tx.get("type"), str) else tx.get("type"),
            value=value,
            input=input_data,
            gas=GasInfo(
                gas_used=str(gas_used),
                gas_price=str(gas_price),
                fee_paid=str(fee_paid),
            ),
            status=status,
            method=method,
            events=events,
            behavior=behavior,
            risk_flags=risk_flags,
            sources=SourcesInfo(
                tx_receipt=f"eth_getTransactionReceipt({tx_hash})",
                logs=f"logs[{len(logs)}]",
                abi=abi_ref or "none",
            ),
            diagnostics=diagnostics,
        )

        # 缓存结果
        if self.cache:
            await self.cache.set_parse_result(
                chain_id,
                tx_hash,
                result.to_dict(),
                self.settings.parse_result_cache_ttl_seconds,
            )

        logger.info(
            "parse_completed",
            chain_id=chain_id,
            tx_hash=tx_hash,
            behavior=behavior.type,
            confidence=behavior.confidence,
            risk_count=len(risk_flags),
        )

        return result
