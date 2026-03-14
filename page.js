import './globals.css'

export const metadata = {
  title: 'Arpi Dash',
  description: 'Personal command center',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-[#e8e8e8] min-h-screen font-mono antialiased">
        {children}
      </body>
    </html>
  )
}
