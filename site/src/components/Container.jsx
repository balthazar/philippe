export function Container({ children, as: Tag = 'div', className = '', ...rest }) {
  return <Tag className={['container', className].filter(Boolean).join(' ')} {...rest}>{children}</Tag>
}
