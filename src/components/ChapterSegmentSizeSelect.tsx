import { CHAPTER_SEGMENT_SIZE_OPTIONS, type ChapterSegmentSize } from '../hooks/useChapterSegmentSize'

interface Props {
  value: ChapterSegmentSize
  onChange: (value: ChapterSegmentSize) => void
}

export default function ChapterSegmentSizeSelect({ value, onChange }: Props) {
  return <label className="chapter-segment-size">每段<select value={value} onChange={(event) => onChange(Number(event.target.value) as ChapterSegmentSize)} aria-label="章节段大小">{CHAPTER_SEGMENT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
}
