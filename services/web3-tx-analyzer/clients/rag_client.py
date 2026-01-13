from __future__ import annotations

import json
from typing import Any

import httpx

from logging import get_logger

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
            return """你是一个专业的 Web3 交易分析助手。你的任务是基于提供的结构化交易解析结果，生成清晰、准确的交易解释。

要求：
1. 只基于提供的事实数据进行解释，不要猜测或编造
2. 如果某些信息不确定，明确标注
3. 输出必须是有效的 JSON 格式
4. 风险评估必须有明确的证据支持

输出格式：
{
  "summary": "交易摘要（1-2句话）",
  "risk_level": "low|medium|high|unknown",
  "risk_reasons": ["风险原因1", "风险原因2"],
  "actions": [
    {
      "type": "行为类型",
      "protocol": "协议名称",
      "assets": [{"token": "代币", "amount": "数量"}]
    }
  ]
}"""
        else:
            return """You are a professional Web3 transaction analysis assistant. Your task is to generate clear and accurate transaction explanations based on the provided structured transaction parsing results.

Requirements:
1. Only explain based on provided facts, do not guess or fabricate
2. If certain information is uncertain, clearly mark it
3. Output must be valid JSON format
4. Risk assessment must be supported by clear evidence

Output format:
{
  "summary": "Transaction summary (1-2 sentences)",
  "risk_level": "low|medium|high|unknown",
  "risk_reasons": ["Risk reason 1", "Risk reason 2"],
  "actions": [
    {
      "type": "Action type",
      "protocol": "Protocol name",
      "assets": [{"token": "Token", "amount": "Amount"}]
    }
  ]
}"""

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
            "behavior": parse_result.get("behavior"),
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

    async def health_check(self) -> bool:
        """健康检查"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/healthz")
                return response.status_code == 200
        except Exception:
            return False
