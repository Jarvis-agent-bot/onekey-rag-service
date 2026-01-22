"""
合约地址查询 API

提供：
1. 直接查询合约地址的协议归属
2. RAG 反向识别（当索引未命中时）
3. 自动学习（将识别结果写入索引）
"""
from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from onekey_rag_service.api.deps import get_db
from onekey_rag_service.config import Settings, get_settings
from onekey_rag_service.models import Chunk, ContractIndex, Page
from onekey_rag_service.services.contract_index import (
    CONTRACT_ADDRESS_RE,
    batch_build_contract_index,
    build_contract_info_from_chunk,
    extract_addresses_from_chunk,
    get_contract_info,
    upsert_contract_info,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


class ContractInfoResponse(BaseModel):
    """合约信息响应"""
    address: str = Field(..., description="合约地址")
    protocol: str = Field(..., description="协议名称")
    protocol_version: str = Field("", description="协议版本")
    contract_type: str = Field("", description="合约类型")
    contract_name: str = Field("", description="完整合约名")
    source_url: str = Field("", description="信息来源 URL")
    confidence: float = Field(1.0, description="置信度 (0-1)")
    chain_id: int = Field(1, description="链 ID")
    source: str = Field("index", description="数据来源: index/rag")


class ContractLookupRequest(BaseModel):
    """批量查询请求"""
    addresses: list[str] = Field(..., description="合约地址列表", max_length=50)
    auto_learn: bool = Field(True, description="未命中时是否自动学习")


class ContractLookupResponse(BaseModel):
    """批量查询响应"""
    results: dict[str, ContractInfoResponse | None] = Field(..., description="查询结果")
    stats: dict[str, int] = Field(..., description="统计信息")


@router.get("/{address}", response_model=ContractInfoResponse)
async def get_contract(
    address: str,
    auto_learn: bool = True,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ContractInfoResponse:
    """
    查询单个合约地址的协议信息

    流程：
    1. 先查询 contract_index 表
    2. 未命中时，使用 RAG 反向识别
    3. 如果 auto_learn=True，将识别结果写入索引
    """
    # 验证地址格式
    address_lower = address.lower().strip()
    if not CONTRACT_ADDRESS_RE.match(address_lower):
        raise HTTPException(status_code=400, detail="Invalid contract address format")

    # Step 1: 查询索引
    contract = get_contract_info(db, address_lower)
    if contract:
        return ContractInfoResponse(
            address=contract.address,
            protocol=contract.protocol,
            protocol_version=contract.protocol_version,
            contract_type=contract.contract_type,
            contract_name=contract.contract_name,
            source_url=contract.source_url,
            confidence=contract.confidence,
            chain_id=contract.chain_id,
            source="index",
        )

    # Step 2: RAG 反向识别
    result = await _rag_reverse_lookup(db, address_lower, auto_learn=auto_learn)
    if result:
        return result

    # 未找到
    raise HTTPException(
        status_code=404,
        detail=f"Contract {address} not found in knowledge base"
    )


@router.post("/lookup", response_model=ContractLookupResponse)
async def batch_lookup(
    request: ContractLookupRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ContractLookupResponse:
    """
    批量查询合约地址的协议信息
    """
    results: dict[str, ContractInfoResponse | None] = {}
    stats = {"total": 0, "index_hits": 0, "rag_hits": 0, "not_found": 0}

    for addr in request.addresses:
        addr_lower = addr.lower().strip()
        if not CONTRACT_ADDRESS_RE.match(addr_lower):
            results[addr] = None
            continue

        stats["total"] += 1

        # 查询索引
        contract = get_contract_info(db, addr_lower)
        if contract:
            stats["index_hits"] += 1
            results[addr] = ContractInfoResponse(
                address=contract.address,
                protocol=contract.protocol,
                protocol_version=contract.protocol_version,
                contract_type=contract.contract_type,
                contract_name=contract.contract_name,
                source_url=contract.source_url,
                confidence=contract.confidence,
                chain_id=contract.chain_id,
                source="index",
            )
            continue

        # RAG 反向识别
        result = await _rag_reverse_lookup(db, addr_lower, auto_learn=request.auto_learn)
        if result:
            stats["rag_hits"] += 1
            results[addr] = result
        else:
            stats["not_found"] += 1
            results[addr] = None

    return ContractLookupResponse(results=results, stats=stats)


async def _rag_reverse_lookup(
    db: Session,
    address: str,
    *,
    auto_learn: bool = True,
) -> ContractInfoResponse | None:
    """
    使用 RAG 反向识别合约协议

    流程：
    1. 在 chunks 中搜索包含该地址的内容
    2. 从 chunk URL 推断协议
    3. 从 chunk 内容提取合约类型
    4. 如果 auto_learn=True，写入索引
    """
    # 直接在 chunks 表中搜索包含该地址的记录
    # 使用 LIKE 查询（因为 FTS 可能对长字符串分词有问题）
    address_pattern = f"%{address}%"

    chunk_result = db.execute(
        text("""
            SELECT c.id, c.chunk_text, p.url, p.kb_id, p.title
            FROM chunks c
            JOIN pages p ON c.page_id = p.id
            WHERE LOWER(c.chunk_text) LIKE LOWER(:pattern)
            LIMIT 5
        """),
        {"pattern": address_pattern}
    ).fetchall()

    if not chunk_result:
        return None

    # 尝试从每个 chunk 中提取协议信息
    for row in chunk_result:
        chunk_text = row.chunk_text
        chunk_url = row.url
        chunk_kb_id = row.kb_id

        contract_info = build_contract_info_from_chunk(
            chunk_text=chunk_text,
            chunk_url=chunk_url,
            chunk_kb_id=chunk_kb_id,
            address=address,
        )

        if contract_info:
            # 自动学习：写入索引
            if auto_learn:
                try:
                    upsert_contract_info(
                        db,
                        address=contract_info.address,
                        protocol=contract_info.protocol,
                        protocol_version=contract_info.protocol_version,
                        contract_type=contract_info.contract_type,
                        contract_name=contract_info.contract_name,
                        source_url=contract_info.source_url,
                        source_kb_id=contract_info.source_kb_id,
                        confidence=contract_info.confidence,
                        chain_id=contract_info.chain_id,
                    )
                    logger.info(
                        "Auto-learned contract: %s -> %s (%s)",
                        address, contract_info.protocol, contract_info.contract_type
                    )
                except Exception as e:
                    logger.warning("Failed to auto-learn contract %s: %s", address, e)

            return ContractInfoResponse(
                address=contract_info.address,
                protocol=contract_info.protocol,
                protocol_version=contract_info.protocol_version,
                contract_type=contract_info.contract_type,
                contract_name=contract_info.contract_name,
                source_url=contract_info.source_url,
                confidence=contract_info.confidence,
                chain_id=contract_info.chain_id,
                source="rag",
            )

    return None


@router.get("/stats/protocols")
async def get_protocol_stats(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    获取协议统计信息
    """
    result = db.execute(
        text("""
            SELECT protocol, COUNT(*) as count
            FROM contract_index
            GROUP BY protocol
            ORDER BY count DESC
        """)
    ).fetchall()

    total = db.scalar(text("SELECT COUNT(*) FROM contract_index")) or 0

    return {
        "total_contracts": total,
        "by_protocol": {row.protocol: row.count for row in result},
    }


class BatchBuildRequest(BaseModel):
    """批量构建索引请求"""
    kb_id: str | None = Field(None, description="限定知识库 ID")
    dry_run: bool = Field(False, description="仅统计，不写入")


class BatchBuildResponse(BaseModel):
    """批量构建索引响应"""
    chunks_scanned: int = Field(..., description="扫描的 chunk 数量")
    addresses_found: int = Field(..., description="发现的地址数量")
    addresses_indexed: int = Field(..., description="成功索引的地址数量")
    addresses_skipped: int = Field(..., description="跳过的地址数量")
    protocols: dict[str, int] = Field(..., description="按协议统计")


@router.post("/build-index", response_model=BatchBuildResponse)
async def batch_build_index(
    request: BatchBuildRequest,
    db: Session = Depends(get_db),
) -> BatchBuildResponse:
    """
    批量扫描已索引的文档，构建合约地址索引

    流程：
    1. 扫描 chunks 表中包含合约地址的记录
    2. 从 URL 推断协议
    3. 从 chunk 内容提取合约类型
    4. 写入 contract_index 表
    """
    stats = batch_build_contract_index(
        db,
        kb_id=request.kb_id,
        dry_run=request.dry_run,
    )

    return BatchBuildResponse(
        chunks_scanned=stats["chunks_scanned"],
        addresses_found=stats["addresses_found"],
        addresses_indexed=stats["addresses_indexed"],
        addresses_skipped=stats["addresses_skipped"],
        protocols=stats["protocols"],
    )
