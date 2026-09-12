#!/command/with-contenv sh
# Hand the workspace back to the user that actually writes to it, every boot.
#
# The image creates and chowns $WORKSPACE_DIR to pwuser at build time (see the Dockerfile), and a
# volume mounted over it at run time hides that completely: the mount arrives owned by root, same as
# postgres-init.sh describes for /var/lib/postgresql, and on any platform whose volume is an ext4
# mount it carries a root-owned, permission-restricted `lost+found` inside it. Unlike postgres,
# `computer` does not refuse to start over that — Chromium and a Bot's shell can still write new
# files fine — but a listing that walks the whole directory (`computer_list_files` at the workspace
# root, or a shell doing `ls -R`) hits `EACCES: permission denied, scandir '.../lost+found'` the
# first time anybody asks, and the Bot has no way to fix its own workspace's ownership: `computer`
# already runs as pwuser by the time it would try.
#
# A oneshot, because this is the same shape as postgres-init.sh's own fix and for the same reason:
# there is no fix-attrs.d under docker/s6, so the built-in s6-overlay service of that name has
# nothing to act on, and `up` here still runs as root, before `computer` drops to pwuser.
set -eu

WORKSPACE="${WORKSPACE_DIR:-/workspace}"
mkdir -p "$WORKSPACE"
chown -R pwuser:pwuser "$WORKSPACE"
