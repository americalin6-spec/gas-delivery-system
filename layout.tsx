import './globals.css'

export const metadata = {
  title: '客戶對話 AI 整理器',
  description: 'AI organize customer conversations',
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
