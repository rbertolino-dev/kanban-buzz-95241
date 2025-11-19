import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/organizationUtils";

export interface OrganizationUser {
  id: string;
  email: string;
  full_name: string | null;
}

export function useOrganizationUsers() {
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const organizationId = await getUserOrganizationId();
      if (!organizationId) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Buscar membros da organização
      const { data: orgMembers, error: membersError } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);

      if (membersError) throw membersError;

      const userIds = orgMembers?.map(m => m.user_id) || [];

      if (userIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Buscar perfis dos membros
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
        .order('full_name', { ascending: true, nullsFirst: false });

      if (profilesError) throw profilesError;

      setUsers((profiles || []) as OrganizationUser[]);
    } catch (error) {
      console.error('Erro ao buscar usuários da organização:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, loading, refetch: fetchUsers };
}

