import ConfirmDialog from '../ConfirmDialog'
import type { SectionDef } from '../../services/worldviewConfig'

interface Props {
  showResetConfirm: boolean
  genre: string
  deletingSection: SectionDef | null
  onConfirmReset: () => void
  onCancelReset: () => void
  onConfirmDelete: (sectionId: string) => void
  onCancelDelete: () => void
}

export default function WorldviewDialogs({
  showResetConfirm,
  genre,
  deletingSection,
  onConfirmReset,
  onCancelReset,
  onConfirmDelete,
  onCancelDelete,
}: Props) {
  return (
    <>
      {showResetConfirm && (
        <ConfirmDialog
          title="重置为品类默认"
          message={`确定恢复为「${genre}」品类的默认栏目配置？所有自定义栏目和子字段将被清除，已有内容不受影响。`}
          confirmText="确定重置"
          danger
          onConfirm={onConfirmReset}
          onCancel={onCancelReset}
        />
      )}

      {deletingSection && (
        <ConfirmDialog
          title="删除栏目"
          message={`确定删除「${deletingSection.label}」栏目？该栏目的所有内容将被删除。`}
          confirmText="删除"
          danger
          onConfirm={() => onConfirmDelete(deletingSection.key)}
          onCancel={onCancelDelete}
        />
      )}
    </>
  )
}
