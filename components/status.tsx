"use client"

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslations } from "@/components/translations-context"

interface StatusDisplayProps {
  status: string
}

export function StatusDisplay({ status }: StatusDisplayProps) {
  const { t } = useTranslations();
  const lastStatusRef = useRef<string>("")
  useEffect(() => {
    if (!status || status === lastStatusRef.current) {
      return
    }
    lastStatusRef.current = status
    if (status.startsWith("Error")) {
      toast.error(t('status.error'), {
        description: status,
        duration: 3000,
      })
    } 
    else if (status.startsWith("Session established")) {
        toast.success(t('status.success'), {
            description: status,
            duration: 5000,
        })
    }
    else if (status.startsWith("Session stopped") || status.startsWith("Reconnecting")) {
      toast.info(t('status.info'), {
        description: status,
        duration: 3000,
      })
    }
  }, [status, t])
    return null
} 
