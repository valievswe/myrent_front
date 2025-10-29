export function toCSV(headers, rows) {
  const escape = (val) => {
    if (val === null || val === undefined) return ''
    const s = String(val)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const headerLine = headers.map((h) => escape(h)).join(',')
  const body = rows.map((r) => r.map((v) => escape(v)).join(',')).join('\n')
  return headerLine + '\n' + body + '\n'
}

export function downloadCSV(filename, headers, rows) {
  const csv = toCSV(headers, rows)
  // Add BOM for Excel compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

