import { createContext, useContext, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'

interface CollapsibleContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

interface CollapsibleProps {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}

export function Collapsible({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div data-state={open ? 'open' : 'closed'}>{children}</div>
    </CollapsibleContext.Provider>
  )
}

interface CollapsibleTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: ReactNode
}

export function CollapsibleTrigger({ children, asChild, onClick, ...props }: CollapsibleTriggerProps) {
  const context = useContext(CollapsibleContext)
  if (!context) throw new Error('CollapsibleTrigger must be used within Collapsible')

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    context.onOpenChange(!context.open)
    onClick?.(e)
  }

  if (asChild && children) {
    // 简化的 asChild 实现：克隆子元素并传递 onClick
    const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
    return (
      <span onClick={handleClick as unknown as React.MouseEventHandler<HTMLSpanElement>}>
        {child}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-state={context.open ? 'open' : 'closed'}
      {...props}
    >
      {children}
    </button>
  )
}

interface CollapsibleContentProps {
  children: ReactNode
  className?: string
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const context = useContext(CollapsibleContext)
  if (!context) throw new Error('CollapsibleContent must be used within Collapsible')

  if (!context.open) return null

  return (
    <div data-state="open" className={className}>
      {children}
    </div>
  )
}
