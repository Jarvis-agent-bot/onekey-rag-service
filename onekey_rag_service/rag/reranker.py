from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Sequence

from onekey_rag_service.config import Settings
from onekey_rag_service.rag.pgvector_store import RetrievedChunk
from onekey_rag_service.utils import clamp_text


class Reranker:
    async def rerank(self, *, query: str, candidates: Sequence[RetrievedChunk], top_n: int) -> list[RetrievedChunk]:
        raise NotImplementedError


@dataclass(frozen=True)
class BGEReranker(Reranker):
    model_name_or_path: str
    device: str = "cpu"
    batch_size: int = 16
    max_candidates: int = 30
    max_chars: int = 1200

    def __post_init__(self) -> None:
        try:
            from sentence_transformers import CrossEncoder  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError("未安装 sentence-transformers，请先安装 requirements.txt 依赖") from e

        object.__setattr__(self, "_model", CrossEncoder(self.model_name_or_path, device=self.device))

    async def rerank(self, *, query: str, candidates: Sequence[RetrievedChunk], top_n: int) -> list[RetrievedChunk]:
        cand = list(candidates)[: self.max_candidates]
        if len(cand) <= 1:
            return cand[:top_n]

        pairs = [(query, clamp_text(c.text, self.max_chars)) for c in cand]
        scores = await asyncio.to_thread(
            self._model.predict,
            pairs,
            batch_size=self.batch_size,
            show_progress_bar=False,
        )

        scored = list(zip(cand, [float(s) for s in scores], strict=False))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [c for c, _ in scored][:top_n]


def build_reranker(settings: Settings) -> Reranker | None:
    provider = (settings.rerank_provider or "none").lower()
    if provider in {"none", "off", "false", "0"}:
        return None

    if provider == "bge_reranker":
        return BGEReranker(
            model_name_or_path=settings.bge_reranker_model,
            device=settings.rerank_device,
            batch_size=settings.rerank_batch_size,
            max_candidates=settings.rerank_max_candidates,
            max_chars=settings.rerank_max_chars,
        )

    raise RuntimeError(f"未知 RERANK_PROVIDER: {settings.rerank_provider}")
