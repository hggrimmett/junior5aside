-- Instantly change a user's login email regardless of the Secure email
-- change setting. Called from /api/admin/update-email as a belt-and-braces
-- follow-up to admin.auth.admin.updateUserById.
--
-- SECURITY DEFINER so it can touch auth.users. Callable only via the
-- service_role client, so end users can't invoke it directly.

CREATE OR REPLACE FUNCTION public.force_email_change_admin(
  p_user_id UUID,
  p_new_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET
    email = p_new_email,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    email_change_sent_at = NULL,
    email_change_confirm_status = 0,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Only the service_role should be able to call this.
REVOKE ALL ON FUNCTION public.force_email_change_admin(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_email_change_admin(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_email_change_admin(UUID, TEXT) TO service_role;
