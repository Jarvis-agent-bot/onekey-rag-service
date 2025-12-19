import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";

export function ConfirmDangerDialog(props: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
  confirmText?: string;
  confirmPlaceholder?: string;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) return;
    setTyped("");
  }, [open]);

  const needsText = !!(props.confirmText || "").trim();
  const canConfirm = useMemo(() => {
    if (props.confirmDisabled) return false;
    if (confirming) return false;
    if (!needsText) return true;
    return typed.trim() === String(props.confirmText || "");
  }, [confirming, needsText, props.confirmDisabled, props.confirmText, typed]);

  async function handleConfirm() {
    try {
      setConfirming(true);
      await props.onConfirm();
      setOpen(false);
    } catch {
    } finally {
      setConfirming(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (confirming) return;
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>{props.trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {needsText ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              请输入 <span className="font-mono">{String(props.confirmText || "")}</span> 确认
            </div>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={props.confirmPlaceholder || "输入确认文本"}
              disabled={confirming}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>取消</AlertDialogCancel>
          <AlertDialogAction
            className={
              props.confirmVariant === "destructive"
                ? "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                : undefined
            }
            disabled={!canConfirm}
            onClick={() => void handleConfirm()}
          >
            {confirming ? "处理中..." : props.confirmLabel || "确认"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
