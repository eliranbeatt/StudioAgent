'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/projects/${id}/overview?tab=knowledge`)
  }, [id, router])

  return <div className='p-8 text-gray-500'>Redirecting to overview...</div>
}
