import Link from 'next/link'

export function Marca({ href = '/inicio' }: { href?: string }) {
  return (
    <Link href={href as never} className="marca" aria-label="Mon Clinique, início">
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--acento)" />
        <path d="M16 44V22l8 12 8-12v22M38 26a8 8 0 1 1 0 14" fill="none" stroke="#F0E4CC" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round" transform="translate(4 -1)" />
      </svg>
      <span><b>Mon Clinique</b><small>Gestão clínica</small></span>
    </Link>
  )
}
