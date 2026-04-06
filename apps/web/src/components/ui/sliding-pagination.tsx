"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion } from "motion/react"

interface PaginationProps {
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
  className?: string
  maxVisiblePages?: number
}

export default function SlidingPagination({
  totalPages,
  currentPage,
  onPageChange,
  className,
  maxVisiblePages = 7,
}: PaginationProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [underlineStyle, setUnderlineStyle] = React.useState<{ left: number; width: number }>({ left: 0, width: 0 })

  React.useEffect(() => {
    const currentBtn = buttonRefs.current[currentPage - 1]
    if (currentBtn && containerRef.current) {
      const rect = currentBtn.getBoundingClientRect()
      const parentRect = containerRef.current.getBoundingClientRect()
      setUnderlineStyle({ left: rect.left - parentRect.left, width: rect.width })
    }
  }, [currentPage, totalPages])

  const generatePages = (): (number | -1)[] => {
    if (totalPages <= maxVisiblePages) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | -1)[] = []
    const sideCount = 1
    const middleCount = maxVisiblePages - 2 * sideCount - 2
    pages.push(1)
    let left = Math.max(currentPage - Math.floor(middleCount / 2), sideCount + 1)
    let right = Math.min(currentPage + Math.floor(middleCount / 2), totalPages - sideCount)
    if (left > sideCount + 1) pages.push(-1)
    else left = sideCount + 1
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < totalPages - sideCount) pages.push(-1)
    pages.push(totalPages)
    return pages
  }

  const pagesToShow = generatePages()

  if (totalPages <= 1) return null

  return (
    <div ref={containerRef} className={cn("relative inline-flex items-center gap-1", className)}>
      {pagesToShow.map((pageNum, i) =>
        pageNum === -1 ? (
          <span key={`dots-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
        ) : (
          <Button
            key={pageNum}
            variant="ghost"
            size="sm"
            ref={(el) => { buttonRefs.current[pageNum - 1] = el }}
            onClick={() => onPageChange(pageNum)}
            className={cn(
              "relative px-3 py-1.5 text-sm h-8 min-w-[2rem]",
              pageNum === currentPage ? "font-semibold text-foreground" : "text-muted-foreground"
            )}
          >
            {pageNum}
          </Button>
        )
      )}
      <motion.div
        layout
        initial={false}
        animate={{ left: underlineStyle.left, width: underlineStyle.width }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="absolute bottom-0 h-0.5 bg-primary rounded pointer-events-none"
      />
    </div>
  )
}
