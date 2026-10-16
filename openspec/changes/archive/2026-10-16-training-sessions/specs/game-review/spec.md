## REMOVED Requirements

### Requirement: A member practises their own mistakes

**Reason**: Practice becomes training (capability `training`): mistakes join the pool automatically, and the server
judges the answers.
**Migration**: Existing `mistake_drills` rows stay and are trained in "My games"; `/practice` redirects to `/training`.
