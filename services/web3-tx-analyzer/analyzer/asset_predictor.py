"""
资产变化预测器

基于函数语义静态预测交易的资产变化
"""
from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field
from decimal import Decimal

from app_logging import get_logger
from integrations.token_service import get_token_service, TokenInfo
from integrations.contract_registry import ContractInfo

logger = get_logger(__name__)


@dataclass
class AssetChange:
    """资产变化"""
    direction: str  # "in" 或 "out"
    token_address: str
    token_symbol: str
    token_name: str
    decimals: int
    amount_raw: str
    amount_formatted: str
    token_type: str = "token"

    def to_dict(self) -> dict[str, Any]:
        return {
            "direction": self.direction,
            "token_address": self.token_address,
            "token_symbol": self.token_symbol,
            "token_name": self.token_name,
            "decimals": self.decimals,
            "amount_raw": self.amount_raw,
            "amount_formatted": self.amount_formatted,
            "token_type": self.token_type,
        }


# 函数 → 资产变化规则
# 格式: (protocol, function_name) -> { out: [...], in: [...] }
ASSET_CHANGE_RULES: dict[tuple[str, str], dict] = {
    # ===== Aave V3 =====
    ("Aave V3", "withdraw"): {
        "behavior": "withdraw",
        "out": [{"source": "atoken_of_param", "param": "asset"}],
        "in": [{"source": "param", "param": "asset"}],
        "amount_param": "amount",
    },
    ("Aave V3", "supply"): {
        "behavior": "deposit",
        "out": [{"source": "param", "param": "asset"}],
        "in": [{"source": "atoken_of_param", "param": "asset"}],
        "amount_param": "amount",
    },
    ("Aave V3", "borrow"): {
        "behavior": "borrow",
        "out": [],
        "in": [{"source": "param", "param": "asset"}],
        "amount_param": "amount",
    },
    ("Aave V3", "repay"): {
        "behavior": "repay",
        "out": [{"source": "param", "param": "asset"}],
        "in": [],
        "amount_param": "amount",
    },
    ("Aave V3", "depositETH"): {
        "behavior": "deposit",
        "out": [{"source": "native_value"}],
        "in": [],
    },
    ("Aave V3", "flashLoan"): {
        "behavior": "flash_loan",
        "out": [],
        "in": [],
    },
    ("Aave V3", "flashLoanSimple"): {
        "behavior": "flash_loan",
        "out": [],
        "in": [],
    },
    ("Aave V2", "withdraw"): {
        "behavior": "withdraw",
        "out": [{"source": "atoken_of_param", "param": "asset"}],
        "in": [{"source": "param", "param": "asset"}],
        "amount_param": "amount",
    },
    ("Aave V2", "deposit"): {
        "behavior": "deposit",
        "out": [{"source": "param", "param": "asset"}],
        "in": [{"source": "atoken_of_param", "param": "asset"}],
        "amount_param": "amount",
    },

    # ===== Uniswap V2 =====
    ("Uniswap V2", "swapExactTokensForTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_param": "amountIn",
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "swapTokensForExactTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_param": "amountInMax",
        "amount_out_param": "amountOut",
    },
    ("Uniswap V2", "swapExactETHForTokens"): {
        "behavior": "swap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "swapExactTokensForETH"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "native"}],
        "amount_param": "amountIn",
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "swapETHForExactTokens"): {
        "behavior": "swap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_out_param": "amountOut",
    },
    ("Uniswap V2", "swapTokensForExactETH"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "native"}],
        "amount_param": "amountInMax",
        "amount_out_param": "amountOut",
    },
    ("Uniswap V2", "swapExactTokensForTokensSupportingFeeOnTransferTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_param": "amountIn",
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "swapExactETHForTokensSupportingFeeOnTransferTokens"): {
        "behavior": "swap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "swapExactTokensForETHSupportingFeeOnTransferTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "native"}],
        "amount_param": "amountIn",
        "amount_out_param": "amountOutMin",
    },
    ("Uniswap V2", "addLiquidity"): {
        "behavior": "liquidity_add",
        "out": [
            {"source": "param", "param": "tokenA"},
            {"source": "param", "param": "tokenB"},
        ],
        "in": [{"source": "lp_token"}],
        "amount_param": "amountADesired",
    },
    ("Uniswap V2", "addLiquidityETH"): {
        "behavior": "liquidity_add",
        "out": [
            {"source": "param", "param": "token"},
            {"source": "native_value"},
        ],
        "in": [{"source": "lp_token"}],
        "amount_param": "amountTokenDesired",
    },
    ("Uniswap V2", "removeLiquidity"): {
        "behavior": "liquidity_remove",
        "out": [{"source": "lp_token"}],
        "in": [
            {"source": "param", "param": "tokenA"},
            {"source": "param", "param": "tokenB"},
        ],
        "amount_param": "liquidity",
    },
    ("Uniswap V2", "removeLiquidityETH"): {
        "behavior": "liquidity_remove",
        "out": [{"source": "lp_token"}],
        "in": [
            {"source": "param", "param": "token"},
            {"source": "native"},
        ],
        "amount_param": "liquidity",
    },
    ("Uniswap V2", "removeLiquidityWithPermit"): {
        "behavior": "liquidity_remove",
        "out": [{"source": "lp_token"}],
        "in": [
            {"source": "param", "param": "tokenA"},
            {"source": "param", "param": "tokenB"},
        ],
        "amount_param": "liquidity",
    },
    ("Uniswap V2", "removeLiquidityETHWithPermit"): {
        "behavior": "liquidity_remove",
        "out": [{"source": "lp_token"}],
        "in": [
            {"source": "param", "param": "token"},
            {"source": "native"},
        ],
        "amount_param": "liquidity",
    },

    # ===== Uniswap V3 =====
    ("Uniswap V3", "exactInputSingle"): {
        "behavior": "swap",
        "out": [{"source": "tuple_param", "param": "params.tokenIn"}],
        "in": [{"source": "tuple_param", "param": "params.tokenOut"}],
        "amount_param": "params.amountIn",
        "amount_out_param": "params.amountOutMinimum",
    },
    ("Uniswap V3", "exactInput"): {
        "behavior": "swap",
        "out": [],  # 需要解析 path
        "in": [],
        "amount_param": "params.amountIn",
        "amount_out_param": "params.amountOutMinimum",
    },
    ("Uniswap V3", "exactOutputSingle"): {
        "behavior": "swap",
        "out": [{"source": "tuple_param", "param": "params.tokenIn"}],
        "in": [{"source": "tuple_param", "param": "params.tokenOut"}],
        "amount_param": "params.amountInMaximum",
        "amount_out_param": "params.amountOut",
    },
    ("Uniswap V3", "exactOutput"): {
        "behavior": "swap",
        "out": [],
        "in": [],
        "amount_param": "params.amountInMaximum",
        "amount_out_param": "params.amountOut",
    },
    ("Uniswap V3", "multicall"): {
        "behavior": "multicall",
        "out": [],
        "in": [],
    },
    ("Uniswap V3", "mint"): {
        "behavior": "liquidity_add",
        "out": [
            {"source": "tuple_param", "param": "params.token0"},
            {"source": "tuple_param", "param": "params.token1"},
        ],
        "in": [],
    },
    ("Uniswap V3", "increaseLiquidity"): {
        "behavior": "liquidity_add",
        "out": [],
        "in": [],
    },
    ("Uniswap V3", "decreaseLiquidity"): {
        "behavior": "liquidity_remove",
        "out": [],
        "in": [],
    },
    ("Uniswap V3", "collect"): {
        "behavior": "claim",
        "out": [],
        "in": [],
    },

    # ===== SushiSwap (same as Uniswap V2) =====
    ("SushiSwap", "swapExactTokensForTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_param": "amountIn",
    },
    ("SushiSwap", "swapExactETHForTokens"): {
        "behavior": "swap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_out_param": "amountOutMin",
    },
    ("SushiSwap", "swapExactTokensForETH"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "native"}],
        "amount_param": "amountIn",
    },
    ("SushiSwap", "addLiquidity"): {
        "behavior": "liquidity_add",
        "out": [
            {"source": "param", "param": "tokenA"},
            {"source": "param", "param": "tokenB"},
        ],
        "in": [{"source": "lp_token"}],
    },
    ("SushiSwap", "removeLiquidity"): {
        "behavior": "liquidity_remove",
        "out": [{"source": "lp_token"}],
        "in": [
            {"source": "param", "param": "tokenA"},
            {"source": "param", "param": "tokenB"},
        ],
    },

    # ===== PancakeSwap (same as Uniswap V2) =====
    ("PancakeSwap", "swapExactTokensForTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
        "amount_param": "amountIn",
    },
    ("PancakeSwap", "swapExactETHForTokens"): {
        "behavior": "swap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "path_last", "param": "path"}],
    },
    ("PancakeSwap", "swapExactTokensForETH"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "native"}],
    },
    ("PancakeSwap", "swapExactTokensForTokensSupportingFeeOnTransferTokens"): {
        "behavior": "swap",
        "out": [{"source": "path_first", "param": "path"}],
        "in": [{"source": "path_last", "param": "path"}],
    },

    # ===== 1inch =====
    ("1inch", "swap"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },
    ("1inch", "unoswap"): {
        "behavior": "swap",
        "out": [{"source": "param", "param": "srcToken"}],
        "in": [],
        "amount_param": "amount",
    },
    ("1inch", "unoswapTo"): {
        "behavior": "swap",
        "out": [{"source": "param", "param": "srcToken"}],
        "in": [],
        "amount_param": "amount",
    },
    ("1inch", "uniswapV3Swap"): {
        "behavior": "swap",
        "out": [],
        "in": [],
        "amount_param": "amount",
    },
    ("1inch", "uniswapV3SwapTo"): {
        "behavior": "swap",
        "out": [],
        "in": [],
        "amount_param": "amount",
    },
    ("1inch", "fillOrder"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },
    ("1inch", "fillOrderRFQ"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },

    # ===== Curve =====
    ("Curve", "exchange"): {
        "behavior": "swap",
        "out": [],
        "in": [],
        "amount_param": "dx",
        "amount_out_param": "min_dy",
    },
    ("Curve", "exchange_underlying"): {
        "behavior": "swap",
        "out": [],
        "in": [],
        "amount_param": "dx",
        "amount_out_param": "min_dy",
    },
    ("Curve", "add_liquidity"): {
        "behavior": "liquidity_add",
        "out": [],
        "in": [],
    },
    ("Curve", "remove_liquidity"): {
        "behavior": "liquidity_remove",
        "out": [],
        "in": [],
    },
    ("Curve", "remove_liquidity_one_coin"): {
        "behavior": "liquidity_remove",
        "out": [],
        "in": [],
    },
    ("Curve", "remove_liquidity_imbalance"): {
        "behavior": "liquidity_remove",
        "out": [],
        "in": [],
    },

    # ===== Compound V2 =====
    ("Compound", "mint"): {
        "behavior": "deposit",
        "out": [],
        "in": [{"source": "contract"}],  # cToken
        "amount_param": "mintAmount",
    },
    ("Compound", "redeem"): {
        "behavior": "withdraw",
        "out": [{"source": "contract"}],  # cToken
        "in": [],
        "amount_param": "redeemTokens",
    },
    ("Compound", "redeemUnderlying"): {
        "behavior": "withdraw",
        "out": [{"source": "contract"}],
        "in": [],
        "amount_param": "redeemAmount",
    },
    ("Compound", "borrow"): {
        "behavior": "borrow",
        "out": [],
        "in": [],
        "amount_param": "borrowAmount",
    },
    ("Compound", "repayBorrow"): {
        "behavior": "repay",
        "out": [],
        "in": [],
        "amount_param": "repayAmount",
    },

    # ===== Compound V3 (Comet) =====
    ("Compound V3", "supply"): {
        "behavior": "deposit",
        "out": [{"source": "param", "param": "asset"}],
        "in": [],
        "amount_param": "amount",
    },
    ("Compound V3", "withdraw"): {
        "behavior": "withdraw",
        "out": [],
        "in": [{"source": "param", "param": "asset"}],
        "amount_param": "amount",
    },

    # ===== Balancer =====
    ("Balancer", "swap"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },
    ("Balancer", "batchSwap"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },
    ("Balancer", "joinPool"): {
        "behavior": "liquidity_add",
        "out": [],
        "in": [],
    },
    ("Balancer", "exitPool"): {
        "behavior": "liquidity_remove",
        "out": [],
        "in": [],
    },

    # ===== Yearn =====
    ("Yearn", "deposit"): {
        "behavior": "deposit",
        "out": [],
        "in": [{"source": "contract"}],  # yToken
    },
    ("Yearn", "withdraw"): {
        "behavior": "withdraw",
        "out": [{"source": "contract"}],
        "in": [],
    },

    # ===== Convex =====
    ("Convex", "deposit"): {
        "behavior": "deposit",
        "out": [],
        "in": [],
    },
    ("Convex", "withdraw"): {
        "behavior": "withdraw",
        "out": [],
        "in": [],
    },
    ("Convex", "getReward"): {
        "behavior": "claim",
        "out": [],
        "in": [],
    },

    # ===== GMX =====
    ("GMX", "createIncreasePosition"): {
        "behavior": "open_position",
        "out": [],
        "in": [],
    },
    ("GMX", "createDecreasePosition"): {
        "behavior": "close_position",
        "out": [],
        "in": [],
    },
    ("GMX", "swap"): {
        "behavior": "swap",
        "out": [],
        "in": [],
    },

    # ===== WETH =====
    ("WETH", "deposit"): {
        "behavior": "wrap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "contract"}],
    },
    ("WETH", "withdraw"): {
        "behavior": "unwrap",
        "out": [{"source": "contract"}],
        "in": [{"source": "native"}],
        "amount_param": "wad",
    },
    ("WBNB", "deposit"): {
        "behavior": "wrap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "contract"}],
    },
    ("WBNB", "withdraw"): {
        "behavior": "unwrap",
        "out": [{"source": "contract"}],
        "in": [{"source": "native"}],
        "amount_param": "wad",
    },
    ("WMATIC", "deposit"): {
        "behavior": "wrap",
        "out": [{"source": "native_value"}],
        "in": [{"source": "contract"}],
    },
    ("WMATIC", "withdraw"): {
        "behavior": "unwrap",
        "out": [{"source": "contract"}],
        "in": [{"source": "native"}],
        "amount_param": "wad",
    },

    # ===== Lido =====
    ("Lido", "submit"): {
        "behavior": "stake",
        "out": [{"source": "native_value"}],
        "in": [{"source": "contract"}],
    },
    ("Lido", "wrap"): {
        "behavior": "wrap",
        "out": [{"source": "steth"}],
        "in": [{"source": "contract"}],
    },
    ("Lido", "unwrap"): {
        "behavior": "unwrap",
        "out": [{"source": "contract"}],
        "in": [{"source": "steth"}],
    },
    ("Lido", "requestWithdrawals"): {
        "behavior": "unstake",
        "out": [{"source": "contract"}],
        "in": [],
    },
    ("Lido", "claimWithdrawals"): {
        "behavior": "claim",
        "out": [],
        "in": [{"source": "native"}],
    },

    # ===== Rocket Pool =====
    ("Rocket Pool", "deposit"): {
        "behavior": "stake",
        "out": [{"source": "native_value"}],
        "in": [{"source": "contract"}],  # rETH
    },
    ("Rocket Pool", "burn"): {
        "behavior": "unstake",
        "out": [{"source": "contract"}],
        "in": [{"source": "native"}],
    },

    # ===== OpenSea / NFT Marketplaces =====
    ("OpenSea", "fulfillBasicOrder"): {
        "behavior": "nft_buy",
        "out": [{"source": "native_value"}],
        "in": [],
    },
    ("OpenSea", "fulfillOrder"): {
        "behavior": "nft_trade",
        "out": [],
        "in": [],
    },
    ("Blur", "execute"): {
        "behavior": "nft_trade",
        "out": [],
        "in": [],
    },

    # ===== Permit2 =====
    ("Permit2", "permit"): {
        "behavior": "approve",
        "out": [],
        "in": [],
        "approval": True,
    },
    ("Permit2", "permitTransferFrom"): {
        "behavior": "transfer",
        "out": [],
        "in": [],
    },
    ("Permit2", "permitBatchTransferFrom"): {
        "behavior": "transfer",
        "out": [],
        "in": [],
    },

    # ===== ERC20 标准 =====
    ("*", "transfer"): {
        "behavior": "transfer",
        "out": [{"source": "contract"}],
        "in": [],
        "amount_param": "amount",
    },
    ("*", "approve"): {
        "behavior": "approve",
        "out": [],
        "in": [],
        "approval": True,
    },
    ("*", "transferFrom"): {
        "behavior": "transfer",
        "out": [],
        "in": [{"source": "contract"}],
        "amount_param": "amount",
    },
    ("*", "increaseAllowance"): {
        "behavior": "approve",
        "out": [],
        "in": [],
        "approval": True,
    },
    ("*", "decreaseAllowance"): {
        "behavior": "approve",
        "out": [],
        "in": [],
        "approval": True,
    },

    # ===== ERC721 标准 =====
    ("*", "safeTransferFrom"): {
        "behavior": "nft_transfer",
        "out": [],
        "in": [],
    },
    ("*", "setApprovalForAll"): {
        "behavior": "nft_approve",
        "out": [],
        "in": [],
        "approval": True,
    },

    # ===== ERC1155 标准 =====
    ("*", "safeTransferFrom"): {
        "behavior": "nft_transfer",
        "out": [],
        "in": [],
    },
    ("*", "safeBatchTransferFrom"): {
        "behavior": "nft_transfer",
        "out": [],
        "in": [],
    },
}


# aToken 地址映射 (简化版，实际应该从链上或 API 获取)
ATOKEN_MAPPING: dict[int, dict[str, str]] = {
    1: {  # Ethereum mainnet
        # underlying -> aToken
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",  # USDC -> aEthUSDC
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8",  # WETH -> aEthWETH
        "0xdac17f958d2ee523a2206206994597c13d831ec7": "0x23878914efe38d27c4d67ab83ed1b93a74d4086a",  # USDT -> aEthUSDT
        "0x6b175474e89094c44da98b954eedeac495271d0f": "0x018008bfb33d285247a21d44e50697654f754e63",  # DAI -> aEthDAI
        "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "0x5ee5bf7ae06d1be5997a1a72006fe6c607ec6de8",  # wstETH -> aEthwstETH
    },
}


class AssetPredictor:
    """资产变化预测器"""

    def __init__(self):
        self.token_service = get_token_service()

    def predict(
        self,
        contract_info: ContractInfo | None,
        function_name: str,
        params: dict[str, Any],
        chain_id: int,
        value: str = "0",
        to_address: str | None = None,
    ) -> tuple[list[AssetChange], str]:
        """
        预测资产变化

        Args:
            contract_info: 合约信息
            function_name: 函数名
            params: 解码后的参数
            chain_id: 链 ID
            value: 交易附带的 ETH 值 (wei)
            to_address: 目标合约地址

        Returns:
            (资产变化列表, 行为类型)
        """
        changes: list[AssetChange] = []
        behavior = "unknown"

        # 查找匹配的规则
        rule = self._find_rule(contract_info, function_name)
        if not rule:
            # 检查是否有通用规则
            rule = ASSET_CHANGE_RULES.get(("*", function_name))

        if not rule:
            logger.debug("no_asset_rule", protocol=contract_info.protocol if contract_info else None, function=function_name)
            return changes, behavior

        behavior = rule.get("behavior", "unknown")

        # 处理 out 资产
        for out_spec in rule.get("out", []):
            change = self._resolve_asset(
                out_spec, "out", params, chain_id, value, to_address, rule, contract_info
            )
            if change:
                changes.append(change)

        # 处理 in 资产
        for in_spec in rule.get("in", []):
            change = self._resolve_asset(
                in_spec, "in", params, chain_id, value, to_address, rule, contract_info
            )
            if change:
                changes.append(change)

        return changes, behavior

    def _find_rule(self, contract_info: ContractInfo | None, function_name: str) -> dict | None:
        """查找匹配的规则"""
        if not contract_info:
            return None

        # 精确匹配协议 + 函数名
        key = (contract_info.protocol, function_name)
        if key in ASSET_CHANGE_RULES:
            return ASSET_CHANGE_RULES[key]

        return None

    def _resolve_asset(
        self,
        spec: dict,
        direction: str,
        params: dict[str, Any],
        chain_id: int,
        value: str,
        to_address: str | None,
        rule: dict,
        contract_info: ContractInfo | None,
    ) -> AssetChange | None:
        """解析资产规格"""
        source = spec.get("source")
        param_name = spec.get("param")

        token_address: str | None = None
        amount_raw: str = "0"

        # 解析 token 地址
        if source == "param" and param_name:
            token_address = self._get_param_value(params, param_name)
        elif source == "path_first" and param_name:
            path = self._get_param_value(params, param_name)
            if isinstance(path, list) and len(path) > 0:
                token_address = path[0]
        elif source == "path_last" and param_name:
            path = self._get_param_value(params, param_name)
            if isinstance(path, list) and len(path) > 0:
                token_address = path[-1]
        elif source == "native_value":
            # 使用交易的 value 作为原生代币
            token_info = self.token_service.get_native_token(chain_id)
            if token_info and value and value != "0":
                amount_raw = value
                return AssetChange(
                    direction=direction,
                    token_address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                    token_symbol=token_info.symbol,
                    token_name=token_info.name,
                    decimals=token_info.decimals,
                    amount_raw=amount_raw,
                    amount_formatted=self.token_service.format_amount(amount_raw, token_info.decimals),
                    token_type="native",
                )
            return None
        elif source == "native":
            token_info = self.token_service.get_native_token(chain_id)
            if token_info:
                amount_param = rule.get("amount_out_param") if direction == "in" else rule.get("amount_param")
                if amount_param:
                    amount_raw = str(self._get_param_value(params, amount_param) or "0")
                return AssetChange(
                    direction=direction,
                    token_address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                    token_symbol=token_info.symbol,
                    token_name=token_info.name,
                    decimals=token_info.decimals,
                    amount_raw=amount_raw,
                    amount_formatted=self.token_service.format_amount(amount_raw, token_info.decimals),
                    token_type="native",
                )
        elif source == "contract" and to_address:
            token_address = to_address
        elif source == "atoken_of_param" and param_name:
            underlying = self._get_param_value(params, param_name)
            if underlying:
                token_address = self._get_atoken_address(chain_id, underlying)
        elif source == "lp_token":
            # LP token 需要更复杂的逻辑来确定地址
            return None

        if not token_address:
            return None

        # 获取 token 信息
        token_info = self.token_service.get_token_info(chain_id, token_address)
        if not token_info:
            # 未知 token，使用默认值
            token_info = TokenInfo(
                address=token_address,
                chain_id=chain_id,
                symbol="UNKNOWN",
                name="Unknown Token",
                decimals=18,
                type="token",
            )

        # 获取金额
        amount_param = rule.get("amount_out_param") if direction == "in" else rule.get("amount_param")
        if amount_param:
            amount_raw = str(self._get_param_value(params, amount_param) or "0")

        # 处理 uint256 max (无限授权)
        if amount_raw and int(amount_raw) == 2**256 - 1:
            amount_formatted = "unlimited"
        else:
            amount_formatted = self.token_service.format_amount(amount_raw, token_info.decimals)

        return AssetChange(
            direction=direction,
            token_address=token_address,
            token_symbol=token_info.symbol,
            token_name=token_info.name,
            decimals=token_info.decimals,
            amount_raw=amount_raw,
            amount_formatted=amount_formatted,
            token_type=token_info.type,
        )

    def _get_param_value(self, params: dict[str, Any], param_name: str) -> Any:
        """获取参数值"""
        # 支持嵌套参数路径，如 "path[0]"
        if "[" in param_name:
            base, rest = param_name.split("[", 1)
            index = int(rest.rstrip("]"))
            arr = params.get(base)
            if isinstance(arr, list) and len(arr) > index:
                return arr[index]
            return None

        return params.get(param_name)

    def _get_atoken_address(self, chain_id: int, underlying: str) -> str | None:
        """获取 aToken 地址"""
        chain_mapping = ATOKEN_MAPPING.get(chain_id, {})
        return chain_mapping.get(underlying.lower())


# 全局单例
_predictor: AssetPredictor | None = None


def get_asset_predictor() -> AssetPredictor:
    """获取资产预测器单例"""
    global _predictor
    if _predictor is None:
        _predictor = AssetPredictor()
    return _predictor
