import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体 */
  variant?: 'primary' | 'secondary' | 'danger' | 'text' | 'ghost'
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 加载中状态（显示 spinner 并禁用） */
  loading?: boolean
  /** 前置图标（loading 时被 spinner 替代） */
  icon?: ReactNode
  children?: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}${className ? ` ${className}` : ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" /> : icon}
      {children}
    </button>
  )
}
