import fs from 'node:fs/promises'
import express from 'express'

// Константы
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Шаблон HTML
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : ''

// Создание HTTP-сервера
const app = express()

let vite

if (!isProduction) {
  const { createServer } = await import('vite')
  
  // Создаём сервер Vite в режиме мидлвары,
  // чтобы родительский сервер мог взять управление на себя
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base
  })
  
  app.use(vite.middlewares)
  
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  
  // Подключаем мидлвару для сжатия размеров ответов
  app.use(compression())
  
  // Раздаём статику
  app.use(base, sirv('./dist/client', { extensions: [] }))
}

app.use('*', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')

    let template
    let render
    
    if (!isProduction) {
      // Читаем шаблон для каждого рендера в dev-режиме
      template = await fs.readFile('./index.html', 'utf-8')
      
      // Применяем HTML-преобразования Vite.
      // Например, Vite HMR
      template = await vite.transformIndexHtml(url, template)
      
      // Загружаем серверную точку входа.
      // Модуль vite.ssrLoadModule автоматически преобразует
      // ваш исходный код ESM для использования в Node.js.
      render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
      
    } else {
      // Берём уже прочитанный ранее из билда шаблон,
      // так как в проде он не будет изменяться во время работы сервера
      template = templateHtml
      
      // Берём функцию render из билда,
      // она уже будет готова к использованию в Node.js
      render = (await import('./dist/server/entry-server.js')).render
    }

      // Запускаем метод рендера HTML
    const rendered = await render()

      // Получившийся HTML добавляем в разметку
    const html = template
      .replace(`<!--ssr-outlet-->`, rendered.html ?? '')

      // Возвращаем всю разметку
    res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
    
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

// Запускаем сервер
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})