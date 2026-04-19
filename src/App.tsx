import { EditorLayout } from '@/components/layout/EditorLayout'
import { GlobalToast } from '@/components/ui/GlobalToast'

/** Root application shell. */
export function App() {
  return (
    <>
      <EditorLayout>
        <div className="flex min-h-[240px] items-center justify-center">
          <h1
            data-testid="app-heading"
            className="text-3xl font-semibold tracking-tight text-(--text-primary)"
          >
            Coming soon
          </h1>
        </div>
      </EditorLayout>
      <GlobalToast />
    </>
  )
}
