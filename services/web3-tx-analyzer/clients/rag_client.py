from __future__ import annotations

import json
from typing import Any

import httpx

from app_logging import get_logger

logger = get_logger(__name__)


class RAGClientError(Exception):
    """RAG 客户端错误"""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class RAGClient:
    """RAG 服务客户端"""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def _build_system_prompt(self, language: str = "zh") -> str:
        """构建系统提示词"""
        if language == "zh":
            return """你是一个专业的 Web3 交易安全分析专家。你的任务是基于提供的交易解析结果，生成**详细的安全分析报告**。

## 你的核心职责

1. **识别协议与合约**：根据地址、函数名识别是哪个协议（Uniswap、Aave、OpenSea 等）
2. **分析交易行为**：判断用户在做什么操作（swap、borrow、approve、transfer 等）
3. **深度安全分析**：这是最重要的！你必须详细分析：
   - 这笔交易有什么潜在风险？
   - 是否存在常见的诈骗模式？（钓鱼授权、假代币、蜜罐合约等）
   - 授权是否过大？资金是否有风险？
   - 合约地址是否可信？是否为已知协议？
4. **给出安全建议**：用户应该注意什么？是否建议执行？

## 分析要点

- **授权类交易 (approve/setApprovalForAll)**：
  - 检查授权金额是否为无限（type(uint256).max）
  - 检查 spender 是否为已知可信协议
  - 警告：授权给未知地址的风险

- **转账类交易 (transfer/transferFrom)**：
  - 检查接收地址是否为零地址或合约
  - 检查转账金额是否合理

- **DeFi 操作 (swap/borrow/stake)**：
  - 检查滑点设置是否合理
  - 检查是否可能被 MEV 攻击
  - 检查协议是否经过审计

- **NFT 操作**：
  - 检查是否为可疑的 NFT 交易
  - 检查价格是否异常

## 输出要求

输出有效 JSON，security_analysis 字段用**自然语言详细描述**安全分析：

{
  "summary": "一句话概括交易内容",
  "protocol": "协议名称或 null",
  "risk_level": "low|medium|high|critical",
  "risk_reasons": ["具体风险点1", "具体风险点2"],
  "actions": [
    {
      "type": "行为类型",
      "protocol": "协议名称",
      "description": "详细描述这个操作做了什么",
      "assets": [{"token": "代币符号", "amount": "数量", "direction": "in/out"}]
    }
  ],
  "security_analysis": "## 安全分析\\n\\n### 交易概述\\n这是一笔...\\n\\n### 风险评估\\n1. **XXX风险**：详细说明...\\n2. **YYY风险**：详细说明...\\n\\n### 安全建议\\n- 建议1\\n- 建议2\\n\\n### 结论\\n这笔交易...",
  "warnings": ["需要特别注意的警告信息"],
  "recommendations": ["给用户的具体建议"],
  "address_attribution": [
    {
      "address": "0x...",
      "protocol": "协议名称",
      "name": "合约名称",
      "is_verified": true,
      "evidence": "识别依据"
    }
  ]
}

重要：security_analysis 字段使用 Markdown 格式，要详细、专业、有深度！"""
        else:
            return """You are a professional Web3 transaction security analyst. Your task is to generate **detailed security analysis reports** based on the provided transaction parsing results.

## Your Core Responsibilities

1. **Identify Protocol & Contract**: Recognize which protocol (Uniswap, Aave, OpenSea, etc.) based on address and function name
2. **Analyze Transaction Behavior**: Determine what operation the user is performing (swap, borrow, approve, transfer, etc.)
3. **Deep Security Analysis**: This is the most important part! You must analyze in detail:
   - What are the potential risks of this transaction?
   - Are there common scam patterns? (Phishing approvals, fake tokens, honeypot contracts, etc.)
   - Is the authorization excessive? Are funds at risk?
   - Is the contract address trustworthy? Is it a known protocol?
4. **Provide Security Recommendations**: What should users be aware of? Should they proceed?

## Analysis Points

- **Approval Transactions (approve/setApprovalForAll)**:
  - Check if approval amount is unlimited (type(uint256).max)
  - Check if spender is a known trusted protocol
  - Warning: Risks of approving unknown addresses

- **Transfer Transactions (transfer/transferFrom)**:
  - Check if recipient is zero address or contract
  - Check if transfer amount is reasonable

- **DeFi Operations (swap/borrow/stake)**:
  - Check if slippage settings are reasonable
  - Check for potential MEV attacks
  - Check if protocol is audited

- **NFT Operations**:
  - Check for suspicious NFT transactions
  - Check for abnormal pricing

## Output Requirements

Output valid JSON, security_analysis field should be **detailed natural language description**:

{
  "summary": "One sentence summary of the transaction",
  "protocol": "Protocol name or null",
  "risk_level": "low|medium|high|critical",
  "risk_reasons": ["Specific risk 1", "Specific risk 2"],
  "actions": [
    {
      "type": "Action type",
      "protocol": "Protocol name",
      "description": "Detailed description of what this action does",
      "assets": [{"token": "Token symbol", "amount": "Amount", "direction": "in/out"}]
    }
  ],
  "security_analysis": "## Security Analysis\\n\\n### Transaction Overview\\nThis is a...\\n\\n### Risk Assessment\\n1. **XXX Risk**: Detailed explanation...\\n2. **YYY Risk**: Detailed explanation...\\n\\n### Security Recommendations\\n- Recommendation 1\\n- Recommendation 2\\n\\n### Conclusion\\nThis transaction...",
  "warnings": ["Important warnings"],
  "recommendations": ["Specific recommendations for users"],
  "address_attribution": [
    {
      "address": "0x...",
      "protocol": "Protocol name",
      "name": "Contract name",
      "is_verified": true,
      "evidence": "Identification evidence"
    }
  ]
}

Important: security_analysis field uses Markdown format, be detailed, professional, and thorough!"""

    def _build_user_prompt(
        self,
        parse_result: dict[str, Any],
        question: str | None = None,
        language: str = "zh",
    ) -> str:
        """构建用户提示词"""
        # 简化解析结果用于上下文
        simplified = {
            "tx_hash": parse_result.get("tx_hash"),
            "chain_id": parse_result.get("chain_id"),
            "from": parse_result.get("from"),
            "to": parse_result.get("to"),
            "value": parse_result.get("value"),
            "status": parse_result.get("status"),
            "protocol": parse_result.get("protocol"),
            "behavior": parse_result.get("behavior"),
            "asset_changes": parse_result.get("asset_changes"),
            "events": [
                {
                    "name": e.get("name"),
                    "event_type": e.get("event_type"),
                    "address": e.get("address"),
                    "args": e.get("args"),
                }
                for e in (parse_result.get("events") or [])[:10]  # 最多 10 个事件
            ],
            "risk_flags": parse_result.get("risk_flags"),
            "method": {
                "name": parse_result.get("method", {}).get("name") if parse_result.get("method") else None,
                "signature": parse_result.get("method", {}).get("signature") if parse_result.get("method") else None,
                "selector": parse_result.get("method", {}).get("selector") if parse_result.get("method") else None,
                "inputs": parse_result.get("method", {}).get("inputs") if parse_result.get("method") else None,
            } if parse_result.get("method") else None,
        }

        context = json.dumps(simplified, ensure_ascii=False, indent=2)

        if language == "zh":
            prompt = f"""请分析以下交易数据并生成解释：

交易数据：
```json
{context}
```
"""
            if question:
                prompt += f"\n用户问题：{question}\n"
            prompt += "\n请输出 JSON 格式的分析结果。"
        else:
            prompt = f"""Please analyze the following transaction data and generate an explanation:

Transaction data:
```json
{context}
```
"""
            if question:
                prompt += f"\nUser question: {question}\n"
            prompt += "\nPlease output the analysis result in JSON format."

        return prompt

    async def explain(
        self,
        parse_result: dict[str, Any],
        question: str | None = None,
        language: str = "zh",
        trace_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """调用 RAG 服务生成交易解释"""
        system_prompt = self._build_system_prompt(language)
        user_prompt = self._build_user_prompt(parse_result, question, language)

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request_body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "metadata": {
                "trace_id": trace_id or parse_result.get("tx_hash"),
                "tx_hash": parse_result.get("tx_hash"),
                "chain_id": parse_result.get("chain_id"),
            },
        }
        if metadata:
            request_body["metadata"].update(metadata)

        logger.debug(
            "rag_request",
            model=self.model,
            trace_id=trace_id,
            tx_hash=parse_result.get("tx_hash"),
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=headers,
                    json=request_body,
                )

                if response.status_code != 200:
                    error_body = response.text
                    logger.error(
                        "rag_error",
                        status_code=response.status_code,
                        error=error_body,
                    )
                    raise RAGClientError(
                        f"RAG request failed: {error_body}",
                        status_code=response.status_code,
                    )

                data = response.json()

            # 提取响应内容
            choices = data.get("choices", [])
            if not choices:
                raise RAGClientError("Empty response from RAG service")

            content = choices[0].get("message", {}).get("content", "")
            sources = data.get("sources", [])

            # 解析 JSON 响应
            try:
                explanation = json.loads(content)
            except json.JSONDecodeError:
                logger.warning("rag_json_parse_error", content=content[:200])
                explanation = {
                    "summary": content,
                    "risk_level": "unknown",
                    "risk_reasons": [],
                    "actions": [],
                }

            # 添加 sources
            explanation["sources"] = sources

            logger.info(
                "rag_response",
                trace_id=trace_id,
                risk_level=explanation.get("risk_level"),
                sources_count=len(sources),
            )

            return explanation

        except httpx.TimeoutException as e:
            logger.error("rag_timeout", error=str(e))
            raise RAGClientError("RAG request timeout") from e
        except httpx.RequestError as e:
            logger.error("rag_request_error", error=str(e))
            raise RAGClientError(f"RAG request error: {str(e)}") from e

    async def explain_calldata(
        self,
        calldata_data: dict[str, Any],
        language: str = "zh",
        trace_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        调用 RAG 服务分析 calldata - 协议识别、行为分析、风险评估全部由 RAG 负责

        Args:
            calldata_data: 基础解析数据 {
                type, raw_calldata, selector, function_name, function_signature,
                decoded_inputs, to_address, from_address, value, chain_id,
                simulation (可选)
            }
            language: 语言
            trace_id: 追踪 ID
            metadata: 用于知识库检索的元数据

        Returns:
            RAG 分析结果
        """
        if language == "zh":
            system_prompt = """你是一个专业的 Web3 交易安全分析专家。你的任务是分析 calldata 数据，**进行深度安全分析**。

## 你的核心职责

1. **识别协议**: 根据合约地址、函数名、selector 确定这是哪个协议
2. **分析行为**: 判断用户要做什么操作（swap、borrow、stake、approve 等）
3. **深度安全分析**（最重要）:
   - 这笔交易有什么潜在风险？
   - 是否存在诈骗模式？（钓鱼授权、假代币、蜜罐等）
   - 授权是否过大？资金是否有风险？
   - 目标地址是否可信？
4. **给出安全建议**: 用户应该注意什么？

## 重点检查

- **approve 类**: 检查授权金额是否无限、spender 是否可信
- **transfer 类**: 检查接收地址、金额是否合理
- **swap 类**: 检查滑点、MEV 风险
- **未知合约**: 特别警告用户谨慎

## 输出格式

{
  "summary": "一句话概括",
  "protocol": "协议名称或 null",
  "risk_level": "low|medium|high|critical",
  "risk_reasons": ["具体风险点"],
  "actions": [
    {
      "type": "行为类型",
      "protocol": "协议名称",
      "description": "详细描述",
      "assets": [{"token": "代币", "amount": "数量", "direction": "in/out"}]
    }
  ],
  "security_analysis": "## 安全分析\\n\\n### 交易概述\\n...\\n\\n### 风险评估\\n1. **风险1**：说明...\\n\\n### 安全建议\\n- 建议1\\n\\n### 结论\\n...",
  "warnings": ["警告信息"],
  "recommendations": ["给用户的建议"],
  "address_attribution": [
    {
      "address": "0x...",
      "protocol": "协议名称",
      "name": "合约名称",
      "is_verified": true,
      "evidence": "识别依据"
    }
  ]
}

security_analysis 用 Markdown 详细写！"""
        else:
            system_prompt = """You are a professional Web3 transaction security analyst. Your task is to analyze calldata and **perform deep security analysis**.

## Your Core Responsibilities

1. **Identify Protocol**: Determine which protocol based on contract address, function name, selector
2. **Analyze Behavior**: What operation is the user performing (swap, borrow, stake, approve, etc.)
3. **Deep Security Analysis** (Most Important):
   - What are the potential risks?
   - Are there scam patterns? (Phishing approvals, fake tokens, honeypots, etc.)
   - Is authorization excessive? Are funds at risk?
   - Is the target address trustworthy?
4. **Provide Security Recommendations**: What should users be aware of?

## Key Checks

- **approve types**: Check if amount is unlimited, if spender is trustworthy
- **transfer types**: Check recipient address, if amount is reasonable
- **swap types**: Check slippage, MEV risks
- **Unknown contracts**: Especially warn users to be cautious

## Output Format

{
  "summary": "One sentence summary",
  "protocol": "Protocol name or null",
  "risk_level": "low|medium|high|critical",
  "risk_reasons": ["Specific risk points"],
  "actions": [
    {
      "type": "Action type",
      "protocol": "Protocol name",
      "description": "Detailed description",
      "assets": [{"token": "Token", "amount": "Amount", "direction": "in/out"}]
    }
  ],
  "security_analysis": "## Security Analysis\\n\\n### Transaction Overview\\n...\\n\\n### Risk Assessment\\n1. **Risk 1**: Explanation...\\n\\n### Security Recommendations\\n- Recommendation 1\\n\\n### Conclusion\\n...",
  "warnings": ["Warning messages"],
  "recommendations": ["Recommendations for users"],
  "address_attribution": [
    {
      "address": "0x...",
      "protocol": "Protocol name",
      "name": "Contract name",
      "is_verified": true,
      "evidence": "Identification evidence"
    }
  ]
}

Write security_analysis in detailed Markdown!"""

        # 构建用户提示
        data_json = json.dumps(calldata_data, ensure_ascii=False, indent=2)
        if language == "zh":
            user_prompt = f"""请分析以下 calldata 数据：

```json
{data_json}
```

请根据知识库信息识别协议、分析行为、评估风险，输出 JSON 格式的分析结果。"""
        else:
            user_prompt = f"""Please analyze the following calldata data:

```json
{data_json}
```

Please identify the protocol, analyze the behavior, assess risks based on knowledge base, and output the analysis result in JSON format."""

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request_body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "metadata": {
                "trace_id": trace_id,
                "chain_id": calldata_data.get("chain_id"),
                **(metadata or {}),
            },
        }

        logger.debug(
            "rag_calldata_request",
            model=self.model,
            trace_id=trace_id,
            selector=calldata_data.get("selector"),
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=headers,
                    json=request_body,
                )

                if response.status_code != 200:
                    error_body = response.text
                    logger.error("rag_calldata_error", status_code=response.status_code, error=error_body)
                    raise RAGClientError(f"RAG request failed: {error_body}", status_code=response.status_code)

                data = response.json()

            choices = data.get("choices", [])
            if not choices:
                raise RAGClientError("Empty response from RAG service")

            content = choices[0].get("message", {}).get("content", "")
            sources = data.get("sources", [])

            try:
                explanation = json.loads(content)
            except json.JSONDecodeError:
                logger.warning("rag_calldata_json_parse_error", content=content[:200])
                explanation = {
                    "summary": content,
                    "protocol": None,
                    "risk_level": "unknown",
                    "risk_reasons": [],
                    "actions": [],
                }

            explanation["sources"] = sources

            logger.info(
                "rag_calldata_response",
                trace_id=trace_id,
                protocol=explanation.get("protocol"),
                risk_level=explanation.get("risk_level"),
                sources_count=len(sources),
            )

            return explanation

        except httpx.TimeoutException as e:
            logger.error("rag_calldata_timeout", error=str(e))
            raise RAGClientError("RAG request timeout") from e
        except httpx.RequestError as e:
            logger.error("rag_calldata_request_error", error=str(e))
            raise RAGClientError(f"RAG request error: {str(e)}") from e

    async def health_check(self) -> bool:
        """健康检查"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/healthz")
                return response.status_code == 200
        except Exception:
            return False

    async def lookup_contract(self, address: str) -> dict[str, Any] | None:
        """
        查询合约索引获取协议信息

        Args:
            address: 合约地址

        Returns:
            {
                "address": "0x...",
                "protocol": "Aave",
                "protocol_version": "V3",
                "contract_type": "WrappedTokenGateway",
                "source": "index"
            }
            或 None (如果未找到)
        """
        if not address:
            return None

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/contracts/{address.lower()}"
                )

                if response.status_code == 200:
                    data = response.json()
                    logger.debug(
                        "contract_index_hit",
                        address=address[:10],
                        protocol=data.get("protocol"),
                    )
                    return data
                elif response.status_code == 404:
                    logger.debug("contract_index_miss", address=address[:10])
                    return None
                else:
                    logger.warning(
                        "contract_index_error",
                        address=address[:10],
                        status_code=response.status_code,
                    )
                    return None
        except Exception as e:
            logger.warning("contract_index_exception", address=address[:10], error=str(e))
            return None

    async def batch_lookup_contracts(
        self, addresses: list[str]
    ) -> dict[str, dict[str, Any] | None]:
        """
        批量查询合约索引

        Args:
            addresses: 合约地址列表

        Returns:
            {address: contract_info} 字典
        """
        if not addresses:
            return {}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/contracts/lookup",
                    json={"addresses": [a.lower() for a in addresses], "auto_learn": False},
                )

                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", {})
                    logger.debug(
                        "contract_batch_lookup",
                        total=len(addresses),
                        found=sum(1 for v in results.values() if v),
                    )
                    return results
                else:
                    logger.warning(
                        "contract_batch_lookup_error",
                        status_code=response.status_code,
                    )
                    return {}
        except Exception as e:
            logger.warning("contract_batch_lookup_exception", error=str(e))
            return {}

    async def list_models(self) -> list[str]:
        """获取可用模型列表"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/v1/models")

            if response.status_code != 200:
                raise RAGClientError(
                    f"RAG list models failed: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            models = data.get("data") or []
            return [model.get("id") for model in models if model.get("id")]
        except httpx.TimeoutException as e:
            logger.error("rag_models_timeout", error=str(e))
            raise RAGClientError("RAG list models timeout") from e
        except httpx.RequestError as e:
            logger.error("rag_models_request_error", error=str(e))
            raise RAGClientError(f"RAG list models request error: {str(e)}") from e

    async def identify_method(
        self,
        selector: str,
        to_address: str | None = None,
        chain_id: int = 1,
        possible_signatures: list[str] | None = None,
        trace_id: str | None = None,
    ) -> dict[str, Any] | None:
        """
        使用 RAG 辅助识别未知方法

        当静态解析（ABI + 4bytes）无法确定方法时，
        调用 RAG 查询协议文档来辅助识别

        Args:
            selector: 函数选择器 (0x + 8字符)
            to_address: 目标合约地址
            chain_id: 链 ID
            possible_signatures: 4bytes 返回的可能签名
            trace_id: 追踪 ID

        Returns:
            {
                "function_name": "...",
                "function_signature": "...",
                "protocol": "...",
                "description": "...",
                "confidence": "high|medium|low",
                "sources": [...],
            }
            或 None (如果无法识别)
        """
        # 构建查询问题
        query_parts = [f"function selector: {selector}"]
        if to_address:
            query_parts.append(f"contract address: {to_address}")
        if chain_id:
            query_parts.append(f"chain_id: {chain_id}")
        if possible_signatures:
            query_parts.append(f"possible signatures: {', '.join(possible_signatures[:5])}")

        question = "What function does this selector correspond to? " + "; ".join(query_parts)

        system_prompt = """You are a Web3 expert. Identify the function based on the selector and context.

Output JSON format:
{
  "function_name": "function name or null if unknown",
  "function_signature": "full signature or null",
  "protocol": "protocol name if identifiable",
  "description": "brief description of what the function does",
  "confidence": "high|medium|low",
  "reasoning": "why you think this is the function"
}

If you cannot identify the function, return {"function_name": null, "confidence": "low"}"""

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request_body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            "response_format": {"type": "json_object"},
            "metadata": {
                "trace_id": trace_id,
                "selector": selector,
                "chain_id": chain_id,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=headers,
                    json=request_body,
                )

                if response.status_code != 200:
                    logger.warning("rag_identify_error", status_code=response.status_code)
                    return None

                data = response.json()

            choices = data.get("choices", [])
            if not choices:
                return None

            content = choices[0].get("message", {}).get("content", "")
            sources = data.get("sources", [])

            try:
                result = json.loads(content)
                result["sources"] = sources
                return result
            except json.JSONDecodeError:
                return None

        except Exception as e:
            logger.warning("rag_identify_exception", error=str(e))
            return None
