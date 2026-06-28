export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="bg-white rounded-3xl rounded-tl-lg px-5 py-4 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}
