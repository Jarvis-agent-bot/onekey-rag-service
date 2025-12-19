import { cn } from "../lib/utils";

export function KbStatsSummary(props: {
  pages: { total: number; last_crawled_at: string | null };
  chunks: { total: number; with_embedding: number; embedding_coverage: number; last_indexed_at: string | null };
  className?: string;
}) {
  const pagesTotal = Number(props.pages?.total || 0);
  const chunksTotal = Number(props.chunks?.total || 0);
  const withEmbedding = Number(props.chunks?.with_embedding || 0);
  const coverage = Math.round((Number(props.chunks?.embedding_coverage || 0) || 0) * 100);
  const lastCrawled = props.pages?.last_crawled_at || "-";
  const lastIndexed = props.chunks?.last_indexed_at || "-";

  if (!pagesTotal && !chunksTotal) {
    return <div className={cn("text-xs text-muted-foreground", props.className)}>未采集/未索引</div>;
  }

  return (
    <div className={cn("space-y-1 text-xs", props.className)}>
      <div className="text-muted-foreground">
        pages <span className="font-mono text-foreground">{pagesTotal}</span> · chunks{" "}
        <span className="font-mono text-foreground">{chunksTotal}</span> · coverage{" "}
        <span className="font-mono text-foreground">{coverage}%</span>
      </div>
      <div className="text-muted-foreground">
        last_crawled <span className="font-mono text-foreground">{lastCrawled}</span>
      </div>
      <div className="text-muted-foreground">
        last_indexed <span className="font-mono text-foreground">{lastIndexed}</span> · with_embedding{" "}
        <span className="font-mono text-foreground">{withEmbedding}</span>
      </div>
    </div>
  );
}

