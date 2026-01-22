"""
合约注册表服务

提供知名合约的识别和 ABI 获取功能
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from dataclasses import dataclass

from app_logging import get_logger

logger = get_logger(__name__)

# 数据目录
DATA_DIR = Path(__file__).parent.parent / "data"
CONTRACTS_FILE = DATA_DIR / "known_contracts.json"
ABI_DIR = DATA_DIR / "protocol_abis"


@dataclass
class ContractInfo:
    """合约信息"""
    address: str
    chain_id: int
    protocol: str
    name: str
    type: str
    abi_file: str | None = None
    website: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "chain_id": self.chain_id,
            "protocol": self.protocol,
            "name": self.name,
            "type": self.type,
            "website": self.website,
        }


class ContractRegistry:
    """合约注册表 - 识别知名合约并提供 ABI"""

    def __init__(self):
        self._contracts: dict[str, dict[str, dict]] = {}
        self._abi_cache: dict[str, list[dict]] = {}
        self._load_contracts()

    def _load_contracts(self) -> None:
        """加载知名合约数据"""
        try:
            if CONTRACTS_FILE.exists():
                with open(CONTRACTS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 转换地址为小写
                    for chain_id, contracts in data.items():
                        self._contracts[chain_id] = {
                            addr.lower(): info for addr, info in contracts.items()
                        }
            logger.info("contract_registry_loaded", count=sum(len(c) for c in self._contracts.values()))
        except Exception as e:
            logger.error("contract_registry_load_error", error=str(e))

    def identify_contract(self, chain_id: int, address: str) -> ContractInfo | None:
        """
        识别合约

        Args:
            chain_id: 链 ID
            address: 合约地址

        Returns:
            ContractInfo 或 None (如果未识别)
        """
        if not address:
            return None

        address = address.lower()
        chain_contracts = self._contracts.get(str(chain_id), {})

        info = chain_contracts.get(address)
        if info:
            return ContractInfo(
                address=address,
                chain_id=chain_id,
                protocol=info.get("protocol", "Unknown"),
                name=info.get("name", "Unknown"),
                type=info.get("type", "unknown"),
                abi_file=info.get("abi_file"),
                website=info.get("website"),
            )

        return None

    def get_local_abi(self, contract_info: ContractInfo) -> list[dict] | None:
        """
        获取本地 ABI

        Args:
            contract_info: 合约信息

        Returns:
            ABI 列表或 None
        """
        if not contract_info or not contract_info.abi_file:
            return None

        # 检查缓存
        cache_key = contract_info.abi_file
        if cache_key in self._abi_cache:
            return self._abi_cache[cache_key]

        # 从文件加载
        abi_path = ABI_DIR / contract_info.abi_file
        try:
            if abi_path.exists():
                with open(abi_path, "r", encoding="utf-8") as f:
                    abi = json.load(f)
                    self._abi_cache[cache_key] = abi
                    logger.debug("local_abi_loaded", file=contract_info.abi_file)
                    return abi
        except Exception as e:
            logger.warning("local_abi_load_error", file=contract_info.abi_file, error=str(e))

        return None

    def get_abi_for_address(self, chain_id: int, address: str) -> tuple[list[dict] | None, str]:
        """
        根据地址获取 ABI

        Args:
            chain_id: 链 ID
            address: 合约地址

        Returns:
            (ABI, source) 元组
        """
        contract_info = self.identify_contract(chain_id, address)
        if contract_info:
            abi = self.get_local_abi(contract_info)
            if abi:
                return abi, "local_registry"

        return None, "unknown"

    def get_contract_type(self, chain_id: int, address: str) -> str | None:
        """获取合约类型"""
        contract_info = self.identify_contract(chain_id, address)
        return contract_info.type if contract_info else None

    def get_protocol_name(self, chain_id: int, address: str) -> str | None:
        """获取协议名称"""
        contract_info = self.identify_contract(chain_id, address)
        return contract_info.protocol if contract_info else None


# 全局单例
_registry: ContractRegistry | None = None


def get_contract_registry() -> ContractRegistry:
    """获取合约注册表单例"""
    global _registry
    if _registry is None:
        _registry = ContractRegistry()
    return _registry
