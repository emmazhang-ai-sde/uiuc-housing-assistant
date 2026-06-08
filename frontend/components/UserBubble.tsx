export default function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end items-start gap-3 my-4">
      <div className="bg-slate-100 rounded-2xl rounded-tr-sm px-5 py-3.5 max-w-[80%] text-[15px] text-slate-800 font-medium leading-relaxed">
        {text}
      </div>
      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center shrink-0 text-sm">
        🌽
      </div>
    </div>
  )
}
