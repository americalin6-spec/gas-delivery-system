import './globals.css'

export const metadata = {
  title: 'LINE 對話 AI 整理器',
  description: 'AI organize LINE chats',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  )
}
