// SOURCING: coss ui Sidebar (group and menu parts) over @tanstack/react-query's program
// list; the shell's ContextPanel is the provider and the frame.
import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { listPrograms, programKeys } from '@/lib/program/api'
import { useNewGraph } from './new-graph'
import { ToolError } from './section'

export function ProgramsPanel() {
  const open = useSearch({ strict: false }).program
  const programs = useQuery({
    queryKey: programKeys.list(),
    queryFn: listPrograms,
  })
  const newGraph = useNewGraph()
  return (
    <SidebarContent role="navigation" aria-label="Graphs">
      <SidebarGroup>
        <SidebarGroupLabel render={<Link to="/canvas" />}>
          Graphs
        </SidebarGroupLabel>
        <SidebarGroupAction
          aria-label="New graph"
          title="New graph"
          disabled={newGraph.isPending}
          onClick={() => newGraph.mutate({})}
        >
          <Icon.NewGraph />
        </SidebarGroupAction>
        <SidebarGroupContent>
          <ToolError error={programs.error ?? newGraph.error} />
          <SidebarMenu>
            {programs.isPending && (
              <>
                <SidebarMenuSkeleton />
                <SidebarMenuSkeleton />
                <SidebarMenuSkeleton />
              </>
            )}
            {programs.data?.map((program) => (
              <SidebarMenuItem key={program.node_id}>
                <SidebarMenuButton
                  size="lg"
                  className="data-[active=true]:bg-selected"
                  isActive={open === program.node_id}
                  render={
                    <Link to="/canvas" search={{ program: program.node_id }} />
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {program.name}
                    </span>
                    <span className="block truncate text-xs font-normal text-ink-faint-sheet">
                      {program.intent}
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}
