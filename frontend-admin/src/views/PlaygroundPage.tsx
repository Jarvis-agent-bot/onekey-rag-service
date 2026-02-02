import { Link } from "react-router-dom";
import { Boxes, MessageSquareText, Radar, Wrench } from "lucide-react";

import { Card } from "../components/Card";
import { Button } from "../components/ui/button";

/**
 * Playground（验证台）
 *
 * 目标：把“如何验证 RAG 是否工作”变成一条清晰路径。
 *
 * 说明：当前 admin 侧没有直接的“发起一次检索/对话”的 API 调用界面。
 * 因此这里先提供：
 * - 入口指引（去哪个前端做提问）
 * - 回链到观测（看 retrieval event / 命中 / 耗时）
 *
 * 后续可以升级为：
 * - 直接在这里发起 query（/v1/chat / /v1/retrieve）
 * - 保存 case（用于回归测试）
 */
export function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <Card
        title="Playground"
        description="验证 RAG 全链路：提问 → 检索 → 生成 → 观测。这里先做“流程入口”，后续再补一键发起查询。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareText className="h-4 w-4" />
              1) 发起一次提问
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              通过前端 Chat/应用入口发起一次真实请求，然后回到“观测”查看检索命中、耗时与错误。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="#" onClick={(e) => e.preventDefault()}>
                  （后续：直达 chat 前端）
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/apps">
                  <Boxes className="mr-2 h-4 w-4" />
                  先去应用
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radar className="h-4 w-4" />
              2) 看检索链路（推荐）
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              打开“观测”中的 retrieval events：
              你能看到 query、召回、重排、命中与错误信息。
            </div>
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/observability">去观测</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4" />
              3) 调参数（先从 Settings/Apps）
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              建议先在“设置”里确认默认 retrieval 参数，再在“应用”里做 app 级别调整。
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/settings">去设置</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/apps">去应用</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
