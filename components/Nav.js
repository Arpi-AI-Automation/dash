'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'HOME', href: '/' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-[#1e1e1e] px-6 py-4 flex items-center gap-8">
      <span className="text-[#f7931a] font-bold tracking-widest text-sm mr-4">
        ARPI_DASH
      </span>
      {tabs.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-xs tracking-widest transition-colors ${
              active
                ? 'text-[#f7931a] border-b border-[#f7931a] pb-[2px]'
                : 'text-[#555] hover:text-[#e8e8e8]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
