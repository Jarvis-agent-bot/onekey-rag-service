import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { apiFetch } from "../lib/api";
import { requireToken, setToken } from "../lib/auth";

type LoginResp = { access_token: string; token_type: string; expires_in: number };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  const fromPath = useMemo(() => {
    const raw = (location.state as { from?: string } | null | undefined)?.from || "/";
    if (typeof raw !== "string" || !raw.startsWith("/") || raw === "/login") return "/";
    return raw;
  }, [location.state]);

  useEffect(() => {
    if (!requireToken()) return;
    navigate(fromPath, { replace: true });
  }, [fromPath, navigate]);

  useEffect(() => {
    // 避免浏览器/密码管理器自动填充导致“默认就有密码值”，这里在 mount 后强制清空一次（并延迟再清一次）。
    const clear = () => {
      try {
        if (passwordRef.current) passwordRef.current.value = "";
      } catch {
        // ignore
      }
      setPassword("");
    };
    clear();
    const t = window.setTimeout(clear, 50);
    return () => window.clearTimeout(t);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiFetch<LoginResp>("/admin/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
    },
    onSuccess: (data) => {
      setToken(data.access_token);
      navigate(fromPath, { replace: true });
      const nextHash = `#${fromPath}`;
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
    },
  });

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background to-muted/40">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_50%_-180px,hsl(var(--primary)/0.18),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[420px] items-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>后台登录</CardTitle>
            <CardDescription>使用环境变量配置的超管账号登录</CardDescription>
          </CardHeader>

          <CardContent>
            <form
              className="space-y-4"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">用户名</div>
                <Input name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">密码</div>
                <Input
                  ref={passwordRef}
                  type="password"
                  name="onekey_admin_password"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {mutation.error ? <ApiErrorBanner error={mutation.error} /> : null}
              <Button type="submit" disabled={mutation.isPending} className="w-full">
                {mutation.isPending ? "登录中..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
