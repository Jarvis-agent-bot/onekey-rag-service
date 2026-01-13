from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class ParseResult(Base):
    """解析结果缓存表"""

    __tablename__ = "parse_results"
    __table_args__ = (
        UniqueConstraint("chain_id", "tx_hash", name="uq_parse_results_chain_tx"),
        Index("idx_parse_results_behavior", "behavior_type"),
        Index("idx_parse_results_chain_block", "chain_id", "block_number"),
        {"schema": "tx_analyzer"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    chain_id = Column(Integer, nullable=False)
    tx_hash = Column(String(66), nullable=False)
    block_number = Column(BigInteger, nullable=True)

    # 解析结果（JSONB 存储完整 TxParseResult）
    parse_result = Column(JSONB, nullable=False)
    behavior_type = Column(String(32), nullable=True)
    confidence = Column(String(16), nullable=True)

    # 元数据
    parser_version = Column(String(16), nullable=False, default="1.0.0")
    parsed_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "chain_id": self.chain_id,
            "tx_hash": self.tx_hash,
            "block_number": self.block_number,
            "parse_result": self.parse_result,
            "behavior_type": self.behavior_type,
            "confidence": self.confidence,
            "parser_version": self.parser_version,
            "parsed_at": self.parsed_at.isoformat() if self.parsed_at else None,
        }


class AbiCache(Base):
    """ABI 缓存表"""

    __tablename__ = "abi_cache"
    __table_args__ = (
        UniqueConstraint("chain_id", "contract_address", name="uq_abi_cache_chain_contract"),
        {"schema": "tx_analyzer"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    chain_id = Column(Integer, nullable=False)
    contract_address = Column(String(42), nullable=False)

    abi = Column(JSONB, nullable=True)
    source = Column(String(32), nullable=True)  # registry / explorer / signature_db
    source_url = Column(Text, nullable=True)
    verified = Column(Boolean, default=False)

    fetched_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "chain_id": self.chain_id,
            "contract_address": self.contract_address,
            "abi": self.abi,
            "source": self.source,
            "source_url": self.source_url,
            "verified": self.verified,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


class ParseLog(Base):
    """解析日志表（用于审计和调试）"""

    __tablename__ = "parse_logs"
    __table_args__ = (
        Index("idx_parse_logs_trace", "trace_id"),
        Index("idx_parse_logs_tx", "chain_id", "tx_hash"),
        Index("idx_parse_logs_time", "created_at"),
        {"schema": "tx_analyzer"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    trace_id = Column(String(64), nullable=False)
    chain_id = Column(Integer, nullable=False)
    tx_hash = Column(String(66), nullable=False)

    # 请求信息
    request_options = Column(JSONB, nullable=True)
    client_ip = Column(String(45), nullable=True)

    # 结果摘要
    status = Column(String(16), nullable=True)  # success / partial / failed
    behavior_type = Column(String(32), nullable=True)
    risk_flags = Column(JSONB, nullable=True)

    # 耗时
    total_ms = Column(Integer, nullable=True)
    parse_ms = Column(Integer, nullable=True)
    rag_ms = Column(Integer, nullable=True)

    # 错误信息
    error_code = Column(String(32), nullable=True)
    error_message = Column(Text, nullable=True)

    # Trace 详情
    trace_steps = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "chain_id": self.chain_id,
            "tx_hash": self.tx_hash,
            "request_options": self.request_options,
            "client_ip": self.client_ip,
            "status": self.status,
            "behavior_type": self.behavior_type,
            "risk_flags": self.risk_flags,
            "total_ms": self.total_ms,
            "parse_ms": self.parse_ms,
            "rag_ms": self.rag_ms,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "trace_steps": self.trace_steps,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
