// SOURCING: lib/figures (which figures the person has switched on); Kit's stage and Theo's, each mounted only when wanted, so a figure that is off declares no operations and runs no loop.
import { KitStage } from '@/components/kit/kit-stage'
import { useFigures } from '@/lib/figures'
import { FaceStage } from './face-stage'

/** The figures loose in the shell: Kit the fox and Theo the agent's face, each if switched on. */
export function Figures() {
  const kit = useFigures((state) => state.kit)
  const theo = useFigures((state) => state.theo)
  return (
    <>
      {theo ? <FaceStage /> : null}
      {kit ? <KitStage /> : null}
    </>
  )
}
