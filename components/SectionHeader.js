export default function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[10px] tracking-[0.2em] text-[#555] uppercase">{label}</span>
      <div className="flex-1 h-px bg-[#1e1e1e]" />
    </div>
  )
}
