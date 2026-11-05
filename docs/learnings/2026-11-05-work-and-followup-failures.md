# Keep work and follow-up failures distinct

Live `655595653` acceptance published a real App, then the conversation lead's
separate WorkReady interpretation failed with an upstream request rejection.
The worker card correctly stayed Ready, but its unlabeled error made the two
outcomes ambiguous.

The native delegation projection assigns `problem` from the assessment receipt,
while `receipt.terminal` retains the worker outcome. The existing renderer now
labels a distinct assessment problem `Follow-up failed:` and retains worker
errors verbatim. Identical messages still appear once. No new schema or parser
is required; this uses the existing two authoritative fields.

Validation: two expected rendered RED failures became five delegation passes.
Together with citation tests, 15 tests / 40 assertions pass. Typecheck and
affected ESLint pass. Four actual workProblems mutations were assertion-killed;
focused LCOV shows 100% helper coverage and CRAP 6. Dryer at 0.8 found no pairs.
Other existing renderer complexity is unchanged and is not certified by these
focused checks. Cloudflare production build passed. Version `ec8ab096-9ff5-4525-af9e-3bae7aa3f247`
was activated at 100% traffic; a signed-in reload of the affected conversation
shows Ready alongside the separate Follow-up failed alert. Evidence is
`live-followup-label.txt` and `live-followup-label-visible.jpg`.

Evidence: `ui-followup-label-{red,green,typecheck,lint,mutator,crapper}.log`
in the task's SSD evidence directory. The backend separately retains published
artifact parts when interpretation fails; this UI label does not create or
verify an App.
