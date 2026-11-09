/** Result of deleting items or customers */
export interface DeleteResult {
  /** Erased completely (they had no history) */
  deleted: number
  /** Kept but made inactive, because past sales or work orders refer to them */
  deactivated: number
  notFound: number
  results: { id: number; name: string; action: 'deleted' | 'deactivated' | 'not_found'; reason?: string }[]
}
