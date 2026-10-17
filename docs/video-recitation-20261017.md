# Visual recitation release 13.8.0
- Enabled for admin, manager, supervisor and teacher, with server-side existing circle-scope RPC verification before creating invitations.
- No attendance-mode filter: both in-person and remote circles use the same optional action. Does not alter attendance/geofence rules.
- One student at a time, approved by teacher. Student selected from authorized active directory, no visitor-supplied name.
- Per-student random channel and 256-bit AES-GCM secret; secret only in link fragment and memory. Two-hour expiry, event/room binding, freshness and replay checks.
- A personal invitation is a bearer credential: possession authorizes a join request, not proof of the person's physical identity. Teacher confirms the participant before recitation.
- Closing the view, signing out or expiration ends the room and stops tracks. No recording.
- Real Supabase synthetic encrypted signaling tested in CI. Does not prove audiovisual transport on different mobile networks; no TURN relay configured.
- The cloud browser returned Site Unavailable on two attempts. No administrator UI login, real account journey or camera/microphone end-to-end test was completed. These remain explicitly unverified.
