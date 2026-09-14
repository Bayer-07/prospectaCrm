export function queueTransferAssigneeId(currentAssigneeId?: string | null, userId?: string | null) {
  return currentAssigneeId && currentAssigneeId === userId ? currentAssigneeId : null;
}
