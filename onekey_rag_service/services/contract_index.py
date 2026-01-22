"""
合约地址 → 协议 索引服务

功能：
1. 查询合约地址的协议归属
2. RAG 反向识别协议
3. 自动学习并写入索引
4. 从 URL 和 chunk 内容中提取协议信息
"""
from __future__ import annotations

import datetime as dt
import re
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from onekey_rag_service.models import ContractIndex

logger = logging.getLogger(__name__)

# 合约地址正则
CONTRACT_ADDRESS_RE = re.compile(r'0x[a-fA-F0-9]{40}', re.IGNORECASE)

# 协议 URL 模式映射
PROTOCOL_URL_PATTERNS: dict[str, dict[str, Any]] = {
    "aave.com": {"protocol": "Aave"},
    "docs.aave.com": {"protocol": "Aave"},
    "docs.uniswap.org": {"protocol": "Uniswap"},
    "uniswap.org": {"protocol": "Uniswap"},
    "docs.compound.finance": {"protocol": "Compound"},
    "compound.finance": {"protocol": "Compound"},
    "curve.fi": {"protocol": "Curve"},
    "docs.curve.fi": {"protocol": "Curve"},
    "lido.fi": {"protocol": "Lido"},
    "docs.lido.fi": {"protocol": "Lido"},
    "docs.makerdao.com": {"protocol": "MakerDAO"},
    "makerdao.com": {"protocol": "MakerDAO"},
    "docs.balancer.fi": {"protocol": "Balancer"},
    "balancer.fi": {"protocol": "Balancer"},
    "docs.1inch.io": {"protocol": "1inch"},
    "1inch.io": {"protocol": "1inch"},
    "docs.sushi.com": {"protocol": "SushiSwap"},
    "sushi.com": {"protocol": "SushiSwap"},
    "docs.yearn.fi": {"protocol": "Yearn"},
    "yearn.fi": {"protocol": "Yearn"},
    "docs.synthetix.io": {"protocol": "Synthetix"},
    "synthetix.io": {"protocol": "Synthetix"},
    "docs.chain.link": {"protocol": "Chainlink"},
    "chain.link": {"protocol": "Chainlink"},
    "docs.convexfinance.com": {"protocol": "Convex"},
    "convexfinance.com": {"protocol": "Convex"},
    "docs.frax.finance": {"protocol": "Frax"},
    "frax.finance": {"protocol": "Frax"},
    "docs.pendle.finance": {"protocol": "Pendle"},
    "pendle.finance": {"protocol": "Pendle"},
    "docs.gmx.io": {"protocol": "GMX"},
    "gmx.io": {"protocol": "GMX"},
}

# 版本号提取模式
VERSION_PATTERNS = [
    (re.compile(r'\bV(\d+)\b', re.IGNORECASE), lambda m: f"V{m.group(1)}"),
    (re.compile(r'\bv(\d+)\b'), lambda m: f"V{m.group(1)}"),
    (re.compile(r'-v(\d+)', re.IGNORECASE), lambda m: f"V{m.group(1)}"),
]


@dataclass
class ContractInfo:
    """合约信息"""
    address: str
    protocol: str
    protocol_version: str = ""
    contract_type: str = ""
    contract_name: str = ""
    source_url: str = ""
    source_kb_id: str = ""
    confidence: float = 1.0
    chain_id: int = 1


def extract_protocol_from_url(url: str) -> dict[str, str] | None:
    """
    从 URL 中提取协议信息

    Args:
        url: 文档 URL

    Returns:
        协议信息字典，如 {"protocol": "Aave"}, 或 None
    """
    if not url:
        return None

    url_lower = url.lower()
    for pattern, info in PROTOCOL_URL_PATTERNS.items():
        if pattern in url_lower:
            return dict(info)

    return None


def extract_version_from_text(text: str) -> str:
    """
    从文本中提取版本号

    Args:
        text: 文本内容（URL、合约名等）

    Returns:
        版本号如 "V3"，或空字符串
    """
    if not text:
        return ""

    for pattern, extractor in VERSION_PATTERNS:
        match = pattern.search(text)
        if match:
            return extractor(match)

    return ""


def extract_contract_type_from_chunk(chunk_text: str, address: str) -> str | None:
    """
    从 chunk 内容中提取合约类型

    支持格式：
    1. Markdown 表格: | [ContractName](link) | [0xaddr](link) | ... |
    2. 纯文本: ContractName: 0xaddr...
    3. 列表: - ContractName (0xaddr)

    Args:
        chunk_text: chunk 文本内容
        address: 合约地址（用于定位行）

    Returns:
        合约类型名称，或 None
    """
    if not chunk_text or not address:
        return None

    address_lower = address.lower()
    lines = chunk_text.split('\n')

    for line in lines:
        if address_lower not in line.lower():
            continue

        # 模式1: Markdown 表格行
        # | [WrappedTokenGateway](../link) | [0xd016...5722](https://...) | ... |
        match = re.search(r'\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*\[0x', line)
        if match:
            return match.group(1).strip()

        # 模式2: Markdown 链接格式（非表格）
        # [WrappedTokenGateway](link) ... 0xd016...
        match = re.search(r'\[([^\]]+)\]\([^)]*\).*?' + address_lower[:10], line, re.IGNORECASE)
        if match:
            return match.group(1).strip()

        # 模式3: 冒号分隔
        # WrappedTokenGateway: 0xd016...
        match = re.search(r'(\w+(?:\s+\w+)?)\s*:\s*' + address_lower[:10], line, re.IGNORECASE)
        if match:
            return match.group(1).strip()

        # 模式4: 括号格式
        # WrappedTokenGateway (0xd016...)
        match = re.search(r'(\w+(?:\s+\w+)?)\s*\(' + address_lower[:10], line, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return None


def extract_addresses_from_chunk(chunk_text: str) -> set[str]:
    """
    从 chunk 中提取所有合约地址

    Args:
        chunk_text: chunk 文本内容

    Returns:
        地址集合（小写）
    """
    if not chunk_text:
        return set()

    return {m.group(0).lower() for m in CONTRACT_ADDRESS_RE.finditer(chunk_text)}


def get_contract_info(session: Session, address: str) -> ContractIndex | None:
    """
    查询合约地址的索引信息

    Args:
        session: 数据库会话
        address: 合约地址

    Returns:
        ContractIndex 对象，或 None
    """
    address_lower = address.lower().strip()
    if not CONTRACT_ADDRESS_RE.match(address_lower):
        return None

    return session.scalar(
        select(ContractIndex).where(ContractIndex.address == address_lower)
    )


def upsert_contract_info(
    session: Session,
    *,
    address: str,
    protocol: str,
    protocol_version: str = "",
    contract_type: str = "",
    contract_name: str = "",
    source_url: str = "",
    source_kb_id: str = "",
    confidence: float = 1.0,
    chain_id: int = 1,
    meta: dict | None = None,
) -> ContractIndex:
    """
    插入或更新合约索引

    Args:
        session: 数据库会话
        address: 合约地址
        protocol: 协议名称
        其他字段...

    Returns:
        ContractIndex 对象
    """
    address_lower = address.lower().strip()

    stmt = pg_insert(ContractIndex).values(
        address=address_lower,
        protocol=protocol,
        protocol_version=protocol_version,
        contract_type=contract_type,
        contract_name=contract_name,
        source_url=source_url,
        source_kb_id=source_kb_id,
        confidence=confidence,
        chain_id=chain_id,
        meta=meta or {},
    ).on_conflict_do_update(
        index_elements=["address"],
        set_={
            "protocol": protocol,
            "protocol_version": protocol_version,
            "contract_type": contract_type,
            "contract_name": contract_name,
            "source_url": source_url,
            "source_kb_id": source_kb_id,
            "confidence": confidence,
            "chain_id": chain_id,
            "meta": meta or {},
            "updated_at": dt.datetime.utcnow(),
        },
    ).returning(ContractIndex)

    result = session.execute(stmt)
    session.commit()
    return result.scalar_one()


def build_contract_info_from_chunk(
    chunk_text: str,
    chunk_url: str,
    chunk_kb_id: str,
    address: str,
) -> ContractInfo | None:
    """
    从 chunk 信息中构建合约信息

    Args:
        chunk_text: chunk 文本内容
        chunk_url: chunk 来源 URL
        chunk_kb_id: chunk 所属知识库 ID
        address: 合约地址

    Returns:
        ContractInfo 对象，或 None（无法提取协议信息）
    """
    # 从 URL 提取协议
    protocol_info = extract_protocol_from_url(chunk_url)
    if not protocol_info:
        return None

    protocol = protocol_info.get("protocol", "")
    if not protocol:
        return None

    # 提取版本号（从 URL 或 chunk 内容）
    version = extract_version_from_text(chunk_url)
    if not version:
        version = extract_version_from_text(chunk_text[:500])

    # 提取合约类型
    contract_type = extract_contract_type_from_chunk(chunk_text, address)

    return ContractInfo(
        address=address.lower(),
        protocol=protocol,
        protocol_version=version,
        contract_type=contract_type or "",
        contract_name="",
        source_url=chunk_url,
        source_kb_id=chunk_kb_id,
        confidence=0.9 if contract_type else 0.7,  # 有合约类型时置信度更高
    )


def batch_build_contract_index(
    session: Session,
    *,
    kb_id: str | None = None,
    batch_size: int = 500,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    批量扫描 chunks 表，提取合约地址并构建索引

    Args:
        session: 数据库会话
        kb_id: 可选，限定知识库 ID
        batch_size: 每批处理的 chunk 数量
        dry_run: 如果为 True，只统计不写入

    Returns:
        统计信息字典
    """
    from sqlalchemy import text

    stats = {
        "chunks_scanned": 0,
        "addresses_found": 0,
        "addresses_indexed": 0,
        "addresses_skipped": 0,
        "protocols": {},
    }

    # 构建查询
    base_query = """
        SELECT c.id, c.chunk_text, p.url, p.kb_id
        FROM chunks c
        JOIN pages p ON c.page_id = p.id
        WHERE c.chunk_text ~ '0x[a-fA-F0-9]{40}'
    """
    params: dict[str, Any] = {}

    if kb_id:
        base_query += " AND p.kb_id = :kb_id"
        params["kb_id"] = kb_id

    base_query += " ORDER BY c.id"

    # 分批处理
    offset = 0
    while True:
        query = base_query + f" LIMIT {batch_size} OFFSET {offset}"
        rows = session.execute(text(query), params).fetchall()

        if not rows:
            break

        for row in rows:
            chunk_text = row.chunk_text
            chunk_url = row.url
            chunk_kb_id = row.kb_id
            stats["chunks_scanned"] += 1

            # 提取地址
            addresses = extract_addresses_from_chunk(chunk_text)
            if not addresses:
                continue

            for addr in addresses:
                stats["addresses_found"] += 1

                # 检查是否已存在
                existing = get_contract_info(session, addr)
                if existing:
                    stats["addresses_skipped"] += 1
                    continue

                # 构建合约信息
                contract_info = build_contract_info_from_chunk(
                    chunk_text=chunk_text,
                    chunk_url=chunk_url,
                    chunk_kb_id=chunk_kb_id,
                    address=addr,
                )

                if not contract_info:
                    stats["addresses_skipped"] += 1
                    continue

                # 写入索引
                if not dry_run:
                    try:
                        upsert_contract_info(
                            session,
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
                        stats["addresses_indexed"] += 1

                        # 统计协议
                        proto = contract_info.protocol
                        stats["protocols"][proto] = stats["protocols"].get(proto, 0) + 1

                        logger.info(
                            "Indexed: %s -> %s (%s)",
                            addr[:10] + "...",
                            contract_info.protocol,
                            contract_info.contract_type or "unknown",
                        )
                    except Exception as e:
                        logger.warning("Failed to index %s: %s", addr, e)
                        stats["addresses_skipped"] += 1
                else:
                    stats["addresses_indexed"] += 1
                    proto = contract_info.protocol
                    stats["protocols"][proto] = stats["protocols"].get(proto, 0) + 1

        offset += batch_size
        logger.info("Processed %d chunks...", stats["chunks_scanned"])

    return stats
