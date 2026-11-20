# Tab Cleanup

- Tabs you create in IAB or Dot are temporary by default and close when the turn ends. Existing persistent tabs stay open unless you close them.
- Call `tab.markDeliverable()` on a tab that should remain open as a user-facing output.
- Call `tab.markHandoff()` only when work should continue in a later turn.
- Marks are turn-scoped and the latest mark for a tab wins. Marked tabs survive the turn and are available in later turns. Mark tabs again in a later turn if it must survive that turn too.
