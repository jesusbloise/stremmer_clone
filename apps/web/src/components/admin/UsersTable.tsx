"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/* =========================================================
   COMPONENTES AUXILIARES
========================================================= */

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-green-500/80" : "bg-zinc-600"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* =========================================================
   TIPOS
========================================================= */

type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "USUARIO";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;

  total_uploads: number;
  public_uploads: number;
  restricted_uploads: number;
  private_access_count: number;
  shared_people_count: number;
};

type UserGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
};

type GroupsResponse = {
  rows: UserGroup[];
  total: number;
};

type CreateGroupInput = {
  name: string;
  description: string;
  color: string;
};

type GroupMember = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  membership_created_at: string;
};

type AvailableGroupUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
};

type GroupMembersResponse = {
  group: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string | null;
    is_active: boolean;
  };
  members: GroupMember[];
  availableUsers: AvailableGroupUser[];
  memberCount: number;
  availableCount: number;
};
type RegistrationInvite = {
  id: string;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;

  created_by_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;

  used_by_id: string | null;
  used_by_name: string | null;
  used_by_email: string | null;
};

type RegistrationInvitesResponse = {
  rows: RegistrationInvite[];
  total: number;
};

type CreateRegistrationInviteResponse = {
  ok: boolean;
  invite: {
    id: string;
    email: string | null;
    expires_at: string;
    created_at: string;
  };
  inviteUrl: string;
};

type GroupPermissionCategory = {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  subcategories: {
    id: string;
    label: string;
    is_active: boolean;
    sort_order: number;
  }[];
};

type GroupPermissionRule = {
  id: string;
  resource_type:
    | "CATEGORY"
    | "SUBCATEGORY"
    | "UPLOAD";
  resource_id: string;
  access_level:
    | "VIEWER"
    | "APPROVER"
    | "EDITOR";
  resource_name?: string | null;
};

type GroupPermissionsResponse = {
  groupId: string;
  rows: GroupPermissionRule[];
  categories: GroupPermissionRule[];
  subcategories: GroupPermissionRule[];
  uploads: GroupPermissionRule[];
  total: number;
};

type GroupPermissionUpload = {
  id: string;
  file_name: string | null;
  display_name: string | null;
  titulo: string | null;
  tipo: string | null;
  category: string | null;
  subcategory: string | null;
  uploaded_at: string | null;
};
/* =========================================================
   API USUARIOS
========================================================= */

async function fetchUsers(
  q: string,
  page: number
) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("page", String(page));
  params.set("limit", "10");

  const response = await fetch(
    `/api/users?${params.toString()}`,
    {
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar los usuarios"
    );
  }

  return result as {
    rows: User[];
    total: number;
  };
}

async function patchUser(
  id: string,
  data: Partial<
    Pick<User, "role" | "is_active">
  >
) {
  const response = await fetch(
    `/api/users/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo actualizar el usuario"
    );
  }

  return result as User;
}

/* =========================================================
   API GRUPOS
========================================================= */

async function fetchGroups() {
  const response = await fetch(
    "/api/user-groups",
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar los grupos"
    );
  }

  return result as GroupsResponse;
}

async function createGroup(
  input: CreateGroupInput
) {
  const response = await fetch(
    "/api/user-groups",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo crear el grupo"
    );
  }

  return result as UserGroup;
}

/* =========================================================
   API MIEMBROS DE GRUPO
========================================================= */

async function fetchGroupMembers(
  groupId: string
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/members`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar los miembros"
    );
  }

  return result as GroupMembersResponse;
}

async function fetchPermissionCategories() {
  const response = await fetch(
    "/api/categories",
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar las categorías"
    );
  }

  return Array.isArray(result?.categories)
    ? (result.categories as GroupPermissionCategory[])
    : [];
}

async function fetchPermissionUploads() {
  const response = await fetch(
    "/api/uploads?limit=1000",
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => []);

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar los archivos"
    );
  }

  return Array.isArray(result)
    ? (result as GroupPermissionUpload[])
    : [];
}

async function fetchGroupPermissions(
  groupId: string
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/permissions`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar los permisos del grupo"
    );
  }

  return result as GroupPermissionsResponse;
}

async function addGroupMembers(
  groupId: string,
  userIds: string[]
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/members`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userIds,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron agregar los usuarios"
    );
  }

  return result as {
    ok: boolean;
    addedCount: number;
    requestedCount: number;
    validCount: number;
  };
}

async function removeGroupMember(
  groupId: string,
  userId: string
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/members`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo quitar el usuario"
    );
  }

  return result as {
    ok: boolean;
    removedCount: number;
  };
}

async function deleteUserGroup(groupId: string) {
  const response = await fetch("/api/user-groups", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      groupId,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error || "No se pudo eliminar el grupo"
    );
  }

  return result as {
    ok: boolean;
    deletedGroup: {
      id: string;
      name: string;
    };
    removedMemberships: number;
  };
}
async function fetchUserDetail(userId: string) {
  const response = await fetch(`/api/users/${userId}`, {
    method: "GET",
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error || "No se pudo cargar el detalle del usuario"
    );
  }

  return result;
}
async function fetchRegistrationInvites() {
  const response = await fetch(
    "/api/registration-invites",
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudieron cargar las invitaciones"
    );
  }

  return result as RegistrationInvitesResponse;
}

async function createRegistrationInvite(input: {
  email: string;
  expiresInHours: number;
}) {
  const response = await fetch(
    "/api/registration-invites",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo crear la invitación"
    );
  }

  return result as CreateRegistrationInviteResponse;
}

async function revokeRegistrationInvite(
  inviteId: string
) {
  const response = await fetch(
    "/api/registration-invites",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inviteId,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo cancelar la invitación"
    );
  }

  return result as {
    ok: boolean;
    invite: RegistrationInvite;
  };
}

async function saveGroupPermission(
  groupId: string,
  input: {
    resourceType:
      | "CATEGORY"
      | "SUBCATEGORY"
      | "UPLOAD";
    resourceId: string;
    accessLevel:
      | "VIEWER"
      | "APPROVER"
      | "EDITOR";
  }
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/permissions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo guardar el permiso"
    );
  }

  return result;
}

async function removeGroupPermission(
  groupId: string,
  input: {
    resourceType:
      | "CATEGORY"
      | "SUBCATEGORY"
      | "UPLOAD";
    resourceId: string;
  }
) {
  const response = await fetch(
    `/api/user-groups/${groupId}/permissions`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        "No se pudo quitar el permiso"
    );
  }

  return result;
}
/* =========================================================
   CONSTANTES
========================================================= */

const ROLE_LABELS: Record<
  UserRole,
  string
> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  USUARIO: "Visita",
};

const GROUP_COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function UsersTable() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [
    groupPanelOpen,
    setGroupPanelOpen,
  ] = useState(true);

  const [
    groupFormOpen,
    setGroupFormOpen,
  ] = useState(false);

  const [groupName, setGroupName] =
    useState("");

  const [
    groupDescription,
    setGroupDescription,
  ] = useState("");

  const [groupColor, setGroupColor] =
    useState(GROUP_COLORS[0]);

  const [
    groupMessage,
    setGroupMessage,
  ] = useState("");

  const [
  selectedGroup,
  setSelectedGroup,
] = useState<UserGroup | null>(null);

const [groupModalTab, setGroupModalTab] =
  useState<"MEMBERS" | "PERMISSIONS">(
    "MEMBERS"
  );

const [selectedUserId, setSelectedUserId] =
  useState<string | null>(null);

const [
  invitePanelOpen,
  setInvitePanelOpen,
] = useState(false);

const [
  inviteEmail,
  setInviteEmail,
] = useState("");

const [
  inviteExpiresInHours,
  setInviteExpiresInHours,
] = useState(72);

const [
  generatedInviteUrl,
  setGeneratedInviteUrl,
] = useState("");

const [
  inviteMessage,
  setInviteMessage,
] = useState("");

const [
  selectedAvailableUserIds,
  setSelectedAvailableUserIds,
] = useState<string[]>([]);

const [
  availableUserSearch,
  setAvailableUserSearch,
] = useState("");

const [
  membersMessage,
  setMembersMessage,
] = useState("");

const [
  permissionUploadSearch,
  setPermissionUploadSearch,
] = useState("");

  /* =========================================================
     CONSULTA DE USUARIOS
  ========================================================= */

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["users", q, page],
    queryFn: () =>
      fetchUsers(q, page),
    staleTime: 10_000,
  });

  /* =========================================================
     CONSULTA DE GRUPOS
  ========================================================= */

  const {
    data: groupsData,
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsQueryError,
  } = useQuery({
    queryKey: ["user-groups"],
    queryFn: fetchGroups,
    staleTime: 10_000,
  });

  /* =========================================================
     CONSULTA DE MIEMBROS
  ========================================================= */

  const {
    data: groupMembersData,
    isLoading: groupMembersLoading,
    isError: groupMembersError,
    error: groupMembersQueryError,
  } = useQuery({
    queryKey: [
      "user-group-members",
      selectedGroup?.id,
    ],
    queryFn: () =>
      fetchGroupMembers(
        selectedGroup!.id
      ),
    enabled: Boolean(selectedGroup?.id),
    staleTime: 5_000,
  });

  const {
  data: selectedUserDetail,
  isLoading: selectedUserDetailLoading,
  isError: selectedUserDetailError,
  error: selectedUserDetailQueryError,
} = useQuery({
  queryKey: ["user-detail", selectedUserId],
  queryFn: () => fetchUserDetail(selectedUserId!),
  enabled: Boolean(selectedUserId),
  staleTime: 5_000,
});

const {
  data: invitesData,
  isLoading: invitesLoading,
  isError: invitesError,
  error: invitesQueryError,
} = useQuery({
  queryKey: ["registration-invites"],
  queryFn: fetchRegistrationInvites,
  enabled: invitePanelOpen,
  staleTime: 5_000,
});

const {
  data: groupPermissionsData,
  isLoading: groupPermissionsLoading,
  isError: groupPermissionsError,
  error: groupPermissionsQueryError,
} = useQuery({
  queryKey: [
    "user-group-permissions",
    selectedGroup?.id,
  ],
  queryFn: () =>
    fetchGroupPermissions(
      selectedGroup!.id
    ),
  enabled:
    Boolean(selectedGroup?.id) &&
    groupModalTab === "PERMISSIONS",
  staleTime: 5_000,
});

const {
  data: permissionCategories = [],
  isLoading: loadingPermissionCategories,
  isError: permissionCategoriesError,
  error: permissionCategoriesQueryError,
} = useQuery({
  queryKey: [
    "permission-categories",
  ],
  queryFn:
    fetchPermissionCategories,
  enabled:
    groupModalTab === "PERMISSIONS",
  staleTime: 30_000,
});

const {
  data: permissionUploads = [],
  isLoading: loadingPermissionUploads,
  isError: permissionUploadsError,
  error: permissionUploadsQueryError,
} = useQuery({
  queryKey: ["permission-uploads"],
  queryFn: fetchPermissionUploads,
  enabled:
    groupModalTab === "PERMISSIONS",
  staleTime: 30_000,
});

  /* =========================================================
     MUTACIÓN DE USUARIO
  ========================================================= */

  const userMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<
        Pick<
          User,
          "role" | "is_active"
        >
      >;
    }) => patchUser(id, data),

    onMutate: async ({
      id,
      data: update,
    }) => {
      await queryClient.cancelQueries({
        queryKey: ["users"],
      });

      const previous =
        queryClient.getQueryData([
          "users",
          q,
          page,
        ]);

      queryClient.setQueryData(
        ["users", q, page],
        (current: any) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            rows: current.rows.map(
              (user: User) =>
                user.id === id
                  ? {
                      ...user,
                      ...update,
                    }
                  : user
            ),
          };
        }
      );

      return {
        previous,
      };
    },

    onError: (
      _mutationError,
      _variables,
      context
    ) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["users", q, page],
          context.previous
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      });
    },
  });

const saveGroupPermissionMutation =
  useMutation({
    mutationFn: ({
      groupId,
      resourceType,
      resourceId,
      accessLevel,
    }: {
      groupId: string;
      resourceType:
        | "CATEGORY"
        | "SUBCATEGORY"
        | "UPLOAD";
      resourceId: string;
      accessLevel:
        | "VIEWER"
        | "APPROVER"
        | "EDITOR";
    }) =>
      saveGroupPermission(
        groupId,
        {
          resourceType,
          resourceId,
          accessLevel,
        }
      ),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "user-group-permissions",
          selectedGroup?.id,
        ],
      });
    },
  });

const removeGroupPermissionMutation =
  useMutation({
    mutationFn: ({
      groupId,
      resourceType,
      resourceId,
    }: {
      groupId: string;
      resourceType:
        | "CATEGORY"
        | "SUBCATEGORY"
        | "UPLOAD";
      resourceId: string;
    }) =>
      removeGroupPermission(
        groupId,
        {
          resourceType,
          resourceId,
        }
      ),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "user-group-permissions",
          selectedGroup?.id,
        ],
      });
    },
  });

  /* =========================================================
     MUTACIÓN CREAR GRUPO
  ========================================================= */

  const groupMutation = useMutation({
    mutationFn: createGroup,

    onSuccess: async () => {
      setGroupName("");
      setGroupDescription("");
      setGroupColor(
        GROUP_COLORS[0]
      );
      setGroupFormOpen(false);

      setGroupMessage(
        "Grupo creado correctamente."
      );

      await queryClient.invalidateQueries({
        queryKey: ["user-groups"],
      });
    },

    onError: (
      mutationError: Error
    ) => {
      setGroupMessage(
        mutationError.message ||
          "No se pudo crear el grupo."
      );
    },
  });

  /* =========================================================
     MUTACIÓN AGREGAR MIEMBROS
  ========================================================= */

  const addMembersMutation =
    useMutation({
      mutationFn: ({
        groupId,
        userIds,
      }: {
        groupId: string;
        userIds: string[];
      }) =>
        addGroupMembers(
          groupId,
          userIds
        ),

      onSuccess: async (result) => {
        setSelectedAvailableUserIds(
          []
        );

        setMembersMessage(
          result.addedCount === 1
            ? "Se agregó 1 miembro al grupo."
            : `Se agregaron ${result.addedCount} miembros al grupo.`
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              "user-group-members",
              selectedGroup?.id,
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "user-groups",
            ],
          }),
        ]);
      },

      onError: (
        mutationError: Error
      ) => {
        setMembersMessage(
          mutationError.message ||
            "No se pudieron agregar los miembros."
        );
      },
    });

  /* =========================================================
     MUTACIÓN QUITAR MIEMBRO
  ========================================================= */

  const removeMemberMutation =
    useMutation({
      mutationFn: ({
        groupId,
        userId,
      }: {
        groupId: string;
        userId: string;
      }) =>
        removeGroupMember(
          groupId,
          userId
        ),

      onSuccess: async () => {
        setMembersMessage(
          "Usuario quitado del grupo."
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              "user-group-members",
              selectedGroup?.id,
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "user-groups",
            ],
          }),
        ]);
      },

      onError: (
        mutationError: Error
      ) => {
        setMembersMessage(
          mutationError.message ||
            "No se pudo quitar el usuario."
        );
      },
    });

    const deleteGroupMutation = useMutation({
  mutationFn: deleteUserGroup,

  onSuccess: async (result) => {
    setGroupMessage(
      `Grupo "${result.deletedGroup.name}" eliminado correctamente.`
    );

    if (selectedGroup?.id === result.deletedGroup.id) {
      setSelectedGroup(null);
    }

    await queryClient.invalidateQueries({
      queryKey: ["user-groups"],
    });
  },

  onError: (mutationError: Error) => {
    setGroupMessage(
      mutationError.message || "No se pudo eliminar el grupo."
    );
  },
});

const filteredPermissionUploads =
  useMemo(() => {
    const term =
      permissionUploadSearch
        .trim()
        .toLowerCase();

    if (!term) {
      return permissionUploads;
    }

    return permissionUploads.filter(
      (upload) => {
        const text = [
          upload.display_name,
          upload.titulo,
          upload.file_name,
          upload.category,
          upload.subcategory,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(term);
      }
    );
  }, [
    permissionUploads,
    permissionUploadSearch,
  ]);

  /* =========================================================
     DATOS DERIVADOS
  ========================================================= */

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const groups =
    groupsData?.rows ?? [];

  const totalGroups =
    groupsData?.total ?? 0;

  const members =
    groupMembersData?.members ?? [];

  const availableUsers =
    groupMembersData?.availableUsers ??
    [];

  const filteredAvailableUsers =
    useMemo(() => {
      const search =
        availableUserSearch
          .trim()
          .toLowerCase();

      if (!search) {
        return availableUsers;
      }

      return availableUsers.filter(
        (user) => {
          const name = String(
            user.name || ""
          ).toLowerCase();

          const email = String(
            user.email || ""
          ).toLowerCase();

          return (
            name.includes(search) ||
            email.includes(search)
          );
        }
      );
    }, [
      availableUsers,
      availableUserSearch,
    ]);

  const totalGroupMembers =
    useMemo(() => {
      return groups.reduce(
        (sum, group) =>
          sum +
          Number(
            group.member_count || 0
          ),
        0
      );
    }, [groups]);

  const totalPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(total / 10)
      ),
    [total]
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        "es-CL",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      ),
    []
  );


  const createInviteMutation = useMutation({
  mutationFn: createRegistrationInvite,

  onSuccess: async (result) => {
    setGeneratedInviteUrl(
      result.inviteUrl
    );

    setInviteMessage(
      "Invitación creada correctamente."
    );

    await queryClient.invalidateQueries({
      queryKey: [
        "registration-invites",
      ],
    });
  },

  onError: (mutationError) => {
    setInviteMessage(
      mutationError instanceof Error
        ? mutationError.message
        : "No se pudo crear la invitación."
    );
  },
});

const revokeInviteMutation = useMutation({
  mutationFn: revokeRegistrationInvite,

  onSuccess: async () => {
    setInviteMessage(
      "Invitación cancelada correctamente."
    );

    await queryClient.invalidateQueries({
      queryKey: [
        "registration-invites",
      ],
    });
  },

  onError: (mutationError) => {
    setInviteMessage(
      mutationError instanceof Error
        ? mutationError.message
        : "No se pudo cancelar la invitación."
    );
  },
});
const handleRevokeInvite = (
  invite: RegistrationInvite
) => {
  const confirmed = window.confirm(
    invite.email
      ? `¿Cancelar la invitación enviada a ${invite.email}?`
      : "¿Cancelar esta invitación abierta?"
  );

  if (!confirmed) {
    return;
  }

  setInviteMessage("");

  revokeInviteMutation.mutate(
    invite.id
  );
};
const handleCreateInvite = () => {
  setInviteMessage("");
  setGeneratedInviteUrl("");

  createInviteMutation.mutate({
    email: inviteEmail.trim(),
    expiresInHours:
      inviteExpiresInHours,
  });
};

const handleCopyInvite = async () => {
  if (!generatedInviteUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(
      generatedInviteUrl
    );

    setInviteMessage(
      "Enlace copiado al portapapeles."
    );
  } catch {
    setInviteMessage(
      "No se pudo copiar automáticamente. Copia el enlace manualmente."
    );
  }
};

const closeInvitePanel = () => {
  if (createInviteMutation.isPending) {
    return;
  }

  setInvitePanelOpen(false);
  setInviteEmail("");
  setInviteExpiresInHours(72);
  setGeneratedInviteUrl("");
  setInviteMessage("");
};
  /* =========================================================
     FUNCIONES DE INTERFAZ
  ========================================================= */

  const handleCreateGroup = () => {
    const cleanName =
      groupName.trim();

    if (!cleanName) {
      setGroupMessage(
        "Escribe el nombre del grupo."
      );
      return;
    }

    setGroupMessage("");

    groupMutation.mutate({
      name: cleanName,
      description:
        groupDescription.trim(),
      color: groupColor,
    });
  };

  const openMembersModal = (
    group: UserGroup
  ) => {
    setSelectedGroup(group);

    setGroupModalTab("MEMBERS");

    setSelectedAvailableUserIds(
      []
    );

    setAvailableUserSearch("");
    setMembersMessage("");
  };

  const closeMembersModal = () => {
    if (
      addMembersMutation.isPending ||
      removeMemberMutation.isPending
    ) {
      return;
    }

    setSelectedGroup(null);

    setSelectedAvailableUserIds(
      []
    );

    setAvailableUserSearch("");
    setMembersMessage("");
  };

  const toggleAvailableUser = (
    userId: string
  ) => {
    setSelectedAvailableUserIds(
      (current) => {
        if (
          current.includes(userId)
        ) {
          return current.filter(
            (id) => id !== userId
          );
        }

        return [
          ...current,
          userId,
        ];
      }
    );
  };

  const selectAllVisibleUsers = () => {
    const visibleIds =
      filteredAvailableUsers.map(
        (user) => user.id
      );

    const allAlreadySelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) =>
        selectedAvailableUserIds.includes(
          id
        )
      );

    if (allAlreadySelected) {
      setSelectedAvailableUserIds(
        (current) =>
          current.filter(
            (id) =>
              !visibleIds.includes(id)
          )
      );

      return;
    }

    setSelectedAvailableUserIds(
      (current) =>
        Array.from(
          new Set([
            ...current,
            ...visibleIds,
          ])
        )
    );
  };

  const handleAddMembers = () => {
    if (!selectedGroup) {
      return;
    }

    if (
      selectedAvailableUserIds.length ===
      0
    ) {
      setMembersMessage(
        "Selecciona al menos un usuario."
      );
      return;
    }

    setMembersMessage("");

    addMembersMutation.mutate({
      groupId: selectedGroup.id,
      userIds:
        selectedAvailableUserIds,
    });
  };

  const handleRemoveMember = (
    userId: string,
    userName: string
  ) => {
    if (!selectedGroup) {
      return;
    }

    const confirmed =
      window.confirm(
        `¿Quitar a ${userName} del grupo ${selectedGroup.name}?`
      );

    if (!confirmed) {
      return;
    }

    setMembersMessage("");

    removeMemberMutation.mutate({
      groupId: selectedGroup.id,
      userId,
    });
  };

  const handleDeleteGroup = (group: UserGroup) => {
  const memberCount = Number(group.member_count || 0);

  const message =
    memberCount > 0
      ? `¿Eliminar el grupo "${group.name}"?\n\nSe quitarán ${memberCount} membresía${
          memberCount === 1 ? "" : "s"
        }, pero no se eliminarán usuarios, archivos ni permisos privados.`
      : `¿Eliminar el grupo "${group.name}"?\n\nNo se eliminarán usuarios, archivos ni permisos privados.`;

  const confirmed = window.confirm(message);

  if (!confirmed) {
    return;
  }

  setGroupMessage("");
  deleteGroupMutation.mutate(group.id);
};
  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="space-y-6">
      {/* =====================================================
          CABECERA
      ====================================================== */}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Administración
            </p>

            <h1 className="mt-1 text-2xl font-bold text-white">
              Gestor de usuarios
            </h1>

            <p className="mt-1 text-sm text-zinc-400">
              Administra usuarios,
              actividad, archivos,
              privacidad y grupos
              internos.
            </p>
            <button
  type="button"
  onClick={() => {
    setInvitePanelOpen(true);
    setInviteMessage("");
    setGeneratedInviteUrl("");
  }}
  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
>
  <span className="text-lg leading-none">
    +
  </span>

  Invitar usuario
</button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-[120px] rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs text-zinc-500">
                Usuarios
              </p>

              <p className="mt-1 text-xl font-bold text-white">
                {total}
              </p>
            </div>

            <div className="min-w-[120px] rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs text-zinc-500">
                Grupos
              </p>

              <p className="mt-1 text-xl font-bold text-orange-300">
                {totalGroups}
              </p>
            </div>

            <div className="min-w-[120px] rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs text-zinc-500">
                Membresías
              </p>

              <p className="mt-1 text-xl font-bold text-sky-300">
                {totalGroupMembers}
              </p>
            </div>

            <div className="min-w-[120px] rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs text-zinc-500">
                Página
              </p>

              <p className="mt-1 text-xl font-bold text-violet-300">
                {page}/{totalPages}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          GRUPOS
      ====================================================== */}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() =>
              setGroupPanelOpen(
                (current) => !current
              )
            }
            className="text-left"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
                👥
              </div>

              <div>
                <h2 className="font-semibold text-white">
                  Grupos de usuarios
                </h2>

                <p className="text-xs text-zinc-400">
                  Organiza usuarios por
                  área, equipo o relación
                  comercial.
                </p>
              </div>

              <span className="ml-1 text-zinc-500">
                {groupPanelOpen
                  ? "▲"
                  : "▼"}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setGroupFormOpen(
                (current) => !current
              );

              setGroupMessage("");
            }}
            className="rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-300 transition hover:bg-orange-500/20"
          >
            {groupFormOpen
              ? "Cancelar"
              : "+ Crear grupo"}
          </button>
        </div>

        {groupPanelOpen && (
          <div className="p-4">
            {groupFormOpen && (
              <div className="mb-5 rounded-xl border border-zinc-700 bg-black/30 p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr_auto]">
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-400">
                      Nombre del grupo
                    </span>

                    <input
                      value={groupName}
                      onChange={(event) =>
                        setGroupName(
                          event.target
                            .value
                        )
                      }
                      placeholder="Ej: Publicidad"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-400">
                      Descripción
                    </span>

                    <input
                      value={
                        groupDescription
                      }
                      onChange={(event) =>
                        setGroupDescription(
                          event.target
                            .value
                        )
                      }
                      placeholder="Ej: Equipo de publicidad y campañas"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70"
                    />
                  </label>

                  <div>
                    <span className="mb-1 block text-xs text-zinc-400">
                      Color
                    </span>

                    <div className="flex h-[38px] items-center gap-2">
                      {GROUP_COLORS.map(
                        (color) => {
                          const active =
                            groupColor ===
                            color;

                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() =>
                                setGroupColor(
                                  color
                                )
                              }
                              aria-label={`Seleccionar color ${color}`}
                              className={`h-7 w-7 rounded-full border-2 transition ${
                                active
                                  ? "scale-110 border-white"
                                  : "border-transparent opacity-70 hover:opacity-100"
                              }`}
                              style={{
                                backgroundColor:
                                  color,
                              }}
                            />
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">
                    Podrás asignar los
                    usuarios después de
                    crear el grupo.
                  </p>

                  <button
                    type="button"
                    onClick={
                      handleCreateGroup
                    }
                    disabled={
                      groupMutation.isPending
                    }
                    className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:opacity-50"
                  >
                    {groupMutation.isPending
                      ? "Creando..."
                      : "Guardar grupo"}
                  </button>
                </div>
              </div>
            )}

            {groupMessage && (
              <div className="mb-4 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
                {groupMessage}
              </div>
            )}

            {groupsLoading ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-sm text-zinc-400">
                Cargando grupos...
              </div>
            ) : groupsError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {groupsQueryError instanceof
                Error
                  ? groupsQueryError.message
                  : "No se pudieron cargar los grupos."}
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center">
                <p className="font-medium text-zinc-300">
                  Todavía no existen
                  grupos
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  Crea el primer grupo
                  para comenzar a
                  organizar los usuarios.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groups.map(
                  (group) => (
                    <article
                      key={group.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                group.color ||
                                "#f97316",
                            }}
                          />

                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-white">
                              {group.name}
                            </h3>

                            <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                              {group.description ||
                                "Sin descripción"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${
                            group.is_active
                              ? "border-green-500/30 bg-green-500/10 text-green-300"
                              : "border-zinc-700 bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {group.is_active
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-3 sm:flex-row sm:items-end sm:justify-between">
  <div>
    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
      Miembros
    </p>

    <p className="text-lg font-bold text-white">
      {group.member_count ?? 0}
    </p>
  </div>

  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => openMembersModal(group)}
      disabled={deleteGroupMutation.isPending}
      className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-50"
    >
      Administrar miembros
    </button>

    <button
      type="button"
      onClick={() => handleDeleteGroup(group)}
      disabled={deleteGroupMutation.isPending}
      className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {deleteGroupMutation.isPending
        ? "Eliminando..."
        : "Eliminar grupo"}
    </button>
  </div>
</div>
                    </article>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================
          TABLA DE USUARIOS
      ====================================================== */}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-white">
              Usuarios registrados
            </h2>

            <p className="mt-1 text-xs text-zinc-400">
              Cambia roles, estados y
              revisa la actividad de cada
              usuario.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(event) => {
                setPage(1);

                setQ(
                  event.target.value
                );
              }}
              placeholder="Buscar por nombre o email…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70 sm:w-80"
            />

            <span className="whitespace-nowrap text-sm text-zinc-400">
              {total} usuario
              {total !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="py-2 pr-4">
                  Usuario
                </th>

                <th className="py-2 pr-4">
                  Rol
                </th>

                <th className="py-2 pr-4">
                  Estado
                </th>

                <th className="py-2 pr-4">
                  Publicados
                </th>

                <th className="py-2 pr-4">
                  Públicos
                </th>

                <th className="py-2 pr-4">
                  Privados
                </th>

                <th className="py-2 pr-4">
                  Accesos recibidos
                </th>

                <th className="py-2 pr-4">
                  Personas compartidas
                </th>

                <th className="py-2 pr-4">
                  Registro
                </th>
              </tr>
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td
                    className="py-6 text-zinc-400"
                    colSpan={9}
                  >
                    Cargando usuarios…
                  </td>
                </tr>
              )}

              {isError &&
                !isLoading && (
                  <tr>
                    <td
                      className="py-6 text-red-400"
                      colSpan={9}
                    >
                      {error instanceof
                      Error
                        ? error.message
                        : "Error al cargar usuarios."}
                    </td>
                  </tr>
                )}

              {!isLoading &&
                !isError &&
                rows.length === 0 && (
                  <tr>
                    <td
                      className="py-8 text-center text-zinc-500"
                      colSpan={9}
                    >
                      No se encontraron
                      usuarios.
                    </td>
                  </tr>
                )}

              {rows.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-zinc-800 transition hover:bg-zinc-800/35"
                >
                  <td className="py-3 pr-4">
                    <div className="flex min-w-[240px] items-center gap-3">
                      <img
                        src={`https://i.pravatar.cc/64?u=${encodeURIComponent(
                          user.email
                        )}`}
                        alt={
                          user.name ??
                          user.email
                        }
                        className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
                      />

                      <div className="min-w-0 flex-1">
  <p className="truncate font-medium text-white">
    {user.name ?? "Sin nombre"}
  </p>

  <p className="truncate text-xs text-zinc-400">
    {user.email}
  </p>

  <button
    type="button"
    onClick={() => setSelectedUserId(user.id)}
    className="mt-1 text-xs font-medium text-orange-300 transition hover:text-orange-200"
  >
    Ver detalle
  </button>
</div>
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <select
                      value={user.role}
                      disabled={
                        userMutation.isPending
                      }
                      onChange={(event) =>
                        userMutation.mutate({
                          id: user.id,
                          data: {
                            role: event
                              .target
                              .value as UserRole,
                          },
                        })
                      }
                      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 disabled:opacity-50"
                    >
                      <option value="SUPER_ADMIN">
                        {
                          ROLE_LABELS.SUPER_ADMIN
                        }
                      </option>

                      <option value="ADMIN">
                        {
                          ROLE_LABELS.ADMIN
                        }
                      </option>

                      <option value="USUARIO">
                        {
                          ROLE_LABELS.USUARIO
                        }
                      </option>
                    </select>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="flex min-w-[110px] items-center gap-2">
                      <Switch
                        checked={
                          user.is_active
                        }
                        onChange={(
                          value
                        ) =>
                          userMutation.mutate(
                            {
                              id: user.id,
                              data: {
                                is_active:
                                  value,
                              },
                            }
                          )
                        }
                      />

                      <span
                        className={
                          user.is_active
                            ? "text-green-400"
                            : "text-zinc-400"
                        }
                      >
                        {user.is_active
                          ? "Activo"
                          : "Inactivo"}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <span className="inline-flex min-w-10 justify-center rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                      {user.total_uploads ??
                        0}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span className="inline-flex min-w-10 justify-center rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-300">
                      {user.public_uploads ??
                        0}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span className="inline-flex min-w-10 justify-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-300">
                      {user.restricted_uploads ??
                        0}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span className="inline-flex min-w-10 justify-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
                      {user.private_access_count ??
                        0}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span className="inline-flex min-w-10 justify-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs text-violet-300">
                      {user.shared_people_count ??
                        0}
                    </span>
                  </td>

                  <td className="whitespace-nowrap py-3 pr-4 text-zinc-400">
                    {dateFormatter.format(
                      new Date(
                        user.created_at
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() =>
              setPage((current) =>
                Math.max(
                  1,
                  current - 1
                )
              )
            }
          >
            ← Anterior
          </button>

          <div className="text-sm text-zinc-400">
            Página {page} de{" "}
            {totalPages}
          </div>

          <button
            type="button"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 disabled:opacity-50"
            disabled={
              page >= totalPages
            }
            onClick={() =>
              setPage(
                (current) =>
                  current + 1
              )
            }
          >
            Siguiente →
          </button>
        </div>
      </section>

      {/* =====================================================
          MODAL DE MIEMBROS
      ====================================================== */}

      {selectedGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div className="flex items-start gap-3">
                <div
                  className="mt-1 h-4 w-4 rounded-full"
                  style={{
                    backgroundColor:
                      selectedGroup.color ||
                      "#f97316",
                  }}
                />

                <div>
                  <h2 className="text-xl font-bold text-white">
                    {selectedGroup.name}
                  </h2>

                  <p className="mt-1 text-sm text-zinc-400">
                    Administra las personas
                    que pertenecen a este
                    grupo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeMembersModal}
                className="text-2xl text-zinc-400 transition hover:text-white"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

                  <div className="border-b border-zinc-800 px-5">
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() =>
        setGroupModalTab("MEMBERS")
      }
      className={[
        "border-b-2 px-4 py-3 text-sm font-medium transition",
        groupModalTab === "MEMBERS"
          ? "border-orange-500 text-orange-300"
          : "border-transparent text-zinc-400 hover:text-white",
      ].join(" ")}
    >
      Miembros
    </button>

    <button
      type="button"
      onClick={() =>
        setGroupModalTab(
          "PERMISSIONS"
        )
      }
      className={[
        "border-b-2 px-4 py-3 text-sm font-medium transition",
        groupModalTab ===
        "PERMISSIONS"
          ? "border-orange-500 text-orange-300"
          : "border-transparent text-zinc-400 hover:text-white",
      ].join(" ")}
    >
      Permisos
    </button>
  </div>
</div>

            <div className="overflow-y-auto p-5">

              {groupModalTab === "MEMBERS" && (
  <>
              {membersMessage && (
                <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
                  {membersMessage}
                </div>
              )}

              {groupMembersLoading ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
                  Cargando miembros...
                </div>
              ) : groupMembersError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {groupMembersQueryError instanceof
                  Error
                    ? groupMembersQueryError.message
                    : "No se pudieron cargar los miembros."}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {/* MIEMBROS ACTUALES */}

                  <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-white">
                          Miembros actuales
                        </h3>

                        <p className="mt-1 text-xs text-zinc-400">
                          {members.length}{" "}
                          miembro
                          {members.length !== 1
                            ? "s"
                            : ""}
                        </p>
                      </div>
                    </div>

                    {members.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                        Este grupo todavía
                        no tiene miembros.
                      </div>
                    ) : (
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {members.map(
                          (member) => {
                            const memberName =
                              member.name ||
                              member.email;

                            return (
                              <div
                                key={
                                  member.id
                                }
                                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-black/30 p-3"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <img
                                    src={`https://i.pravatar.cc/64?u=${encodeURIComponent(
                                      member.email
                                    )}`}
                                    alt={
                                      memberName
                                    }
                                    className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
                                  />

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-white">
                                      {
                                        memberName
                                      }
                                    </p>

                                    <p className="truncate text-xs text-zinc-400">
                                      {
                                        member.email
                                      }
                                    </p>

                                    <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                                      {ROLE_LABELS[
                                        member
                                          .role
                                      ] ||
                                        member.role}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    removeMemberMutation.isPending
                                  }
                                  onClick={() =>
                                    handleRemoveMember(
                                      member.id,
                                      memberName
                                    )
                                  }
                                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  Quitar
                                </button>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </section>

                  {/* USUARIOS DISPONIBLES */}

                  <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <div className="mb-4">
                      <h3 className="font-semibold text-white">
                        Agregar usuarios
                      </h3>

                      <p className="mt-1 text-xs text-zinc-400">
                        Selecciona una o
                        varias personas.
                      </p>
                    </div>

                    <input
                      value={
                        availableUserSearch
                      }
                      onChange={(event) =>
                        setAvailableUserSearch(
                          event.target
                            .value
                        )
                      }
                      placeholder="Buscar por nombre o email…"
                      className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70"
                    />

                    {filteredAvailableUsers.length >
                      0 && (
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={
                            selectAllVisibleUsers
                          }
                          className="text-xs text-orange-300 hover:text-orange-200"
                        >
                          Seleccionar todos
                          los visibles
                        </button>

                        <span className="text-xs text-zinc-500">
                          {
                            selectedAvailableUserIds.length
                          }{" "}
                          seleccionado
                          {selectedAvailableUserIds.length !==
                          1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                    )}

                    {availableUsers.length ===
                    0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                        Todos los usuarios
                        ya pertenecen a este
                        grupo.
                      </div>
                    ) : filteredAvailableUsers.length ===
                      0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                        No se encontraron
                        usuarios.
                      </div>
                    ) : (
                      <div className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
                        {filteredAvailableUsers.map(
                          (user) => {
                            const checked =
                              selectedAvailableUserIds.includes(
                                user.id
                              );

                            return (
                              <label
                                key={
                                  user.id
                                }
                                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                                  checked
                                    ? "border-orange-500/60 bg-orange-500/10"
                                    : "border-zinc-800 bg-black/30 hover:border-zinc-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    checked
                                  }
                                  onChange={() =>
                                    toggleAvailableUser(
                                      user.id
                                    )
                                  }
                                  className="h-4 w-4 accent-orange-500"
                                />

                                <img
                                  src={`https://i.pravatar.cc/64?u=${encodeURIComponent(
                                    user.email
                                  )}`}
                                  alt={
                                    user.name ||
                                    user.email
                                  }
                                  className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
                                />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-white">
                                    {user.name ||
                                      "Sin nombre"}
                                  </p>

                                  <p className="truncate text-xs text-zinc-400">
                                    {
                                      user.email
                                    }
                                  </p>
                                </div>

                                {!user.is_active && (
                                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">
                                    Inactivo
                                  </span>
                                )}
                              </label>
                            );
                          }
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={
                        handleAddMembers
                      }
                      disabled={
                        selectedAvailableUserIds.length ===
                          0 ||
                        addMembersMutation.isPending
                      }
                      className="mt-4 w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:opacity-50"
                    >
                      {addMembersMutation.isPending
                        ? "Agregando..."
                        : `Agregar ${
                            selectedAvailableUserIds.length ||
                            ""
                          } miembro${
                            selectedAvailableUserIds.length ===
                            1
                              ? ""
                              : "s"
                          }`}
                    </button>
                  </section>
                </div>
              )}

                </>
)}
{groupModalTab === "PERMISSIONS" && (
  <div className="space-y-5">
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Permisos del grupo
          </h3>

          <p className="mt-1 text-sm text-zinc-400">
            Define a qué categorías completas puede acceder este grupo.
          </p>
        </div>

        <div className="text-xs text-zinc-500">
          Categorías asignadas:{" "}
          <span className="font-semibold text-orange-300">
            {groupPermissionsData?.categories?.length ?? 0}
          </span>
        </div>
      </div>
    </div>

    <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4">
        <h4 className="font-semibold text-white">
          Categorías completas
        </h4>

        <p className="mt-1 text-xs leading-5 text-zinc-400">
          Si asignas una categoría, los miembros del grupo tendrán acceso
          automático a los archivos actuales y futuros de esa categoría.
        </p>
      </div>

      {loadingPermissionCategories ||
      groupPermissionsLoading ? (
        <div className="rounded-lg border border-zinc-800 bg-black/30 p-6 text-center text-sm text-zinc-400">
          Cargando categorías y permisos...
        </div>
      ) : permissionCategoriesError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {permissionCategoriesQueryError instanceof Error
            ? permissionCategoriesQueryError.message
            : "No se pudieron cargar las categorías."}
        </div>
      ) : groupPermissionsError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {groupPermissionsQueryError instanceof Error
            ? groupPermissionsQueryError.message
            : "No se pudieron cargar los permisos del grupo."}
        </div>
      ) : permissionCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
          No hay categorías disponibles.
        </div>
      ) : (
        <div className="space-y-2">
          {permissionCategories.map((category) => {
            const assignedRule =
              groupPermissionsData?.categories?.find(
                (rule) =>
                  rule.resource_id === category.id
              );

            const selected = Boolean(
              assignedRule
            );

            const saving =
              saveGroupPermissionMutation.isPending ||
              removeGroupPermissionMutation.isPending;

            return (
              <div
                key={category.id}
                className={[
                  "rounded-xl border p-4 transition",
                  selected
                    ? "border-orange-500/60 bg-orange-500/10"
                    : "border-zinc-800 bg-black/30",
                ].join(" ")}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={saving}
                      onChange={() => {
                        if (!selectedGroup) {
                          return;
                        }

                        if (selected) {
                          removeGroupPermissionMutation.mutate({
                            groupId:
                              selectedGroup.id,
                            resourceType:
                              "CATEGORY",
                            resourceId:
                              category.id,
                          });

                          return;
                        }

                        saveGroupPermissionMutation.mutate({
                          groupId:
                            selectedGroup.id,
                          resourceType:
                            "CATEGORY",
                          resourceId:
                            category.id,
                          accessLevel:
                            "VIEWER",
                        });
                      }}
                      className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
                    />

                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">
                        {category.label}
                      </span>

                      <span className="mt-1 block text-xs text-zinc-500">
                        {category.description ||
                          `Slug: ${category.slug}`}
                      </span>

                      <span className="mt-1 block text-[11px] text-zinc-500">
                        {
                          category.subcategories.filter(
                            (subcategory) =>
                              subcategory.is_active
                          ).length
                        }{" "}
                        subcategoría
                        {category.subcategories.filter(
                          (subcategory) =>
                            subcategory.is_active
                        ).length !== 1
                          ? "s"
                          : ""}
                      </span>
                    </span>
                  </label>

                  {selected && (
                    <select
                      value={
                        assignedRule?.access_level ||
                        "VIEWER"
                      }
                      disabled={saving}
                      onChange={(event) => {
                        if (!selectedGroup) {
                          return;
                        }

                        saveGroupPermissionMutation.mutate({
                          groupId:
                            selectedGroup.id,
                          resourceType:
                            "CATEGORY",
                          resourceId:
                            category.id,
                          accessLevel:
                            event.target.value as
                              | "VIEWER"
                              | "APPROVER"
                              | "EDITOR",
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-orange-500/70 sm:w-44"
                    >
                      <option value="VIEWER">
                        Puede ver
                      </option>

                      <option value="APPROVER">
                        Puede aprobar
                      </option>

                      <option value="EDITOR">
                        Puede editar
                      </option>
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>

   <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
  <div className="mb-4">
    <h4 className="font-semibold text-white">
      Subcategorías específicas
    </h4>

    <p className="mt-1 text-xs leading-5 text-zinc-400">
      Permite acceso únicamente a determinadas
      subcategorías sin habilitar la categoría completa.
    </p>
  </div>

  <div className="space-y-5">
    {permissionCategories.map((category) => {
      const activeSubcategories =
        category.subcategories.filter(
          (subcategory) =>
            subcategory.is_active
        );

      if (
        activeSubcategories.length === 0
      ) {
        return null;
      }

      return (
        <div
          key={category.id}
          className="rounded-xl border border-zinc-800 bg-black/30 p-4"
        >
          <p className="mb-3 text-sm font-semibold text-orange-200">
            {category.label}
          </p>

          <div className="space-y-2">
            {activeSubcategories.map(
              (subcategory) => {
                const assignedRule =
                  groupPermissionsData
                    ?.subcategories?.find(
                      (rule) =>
                        rule.resource_id ===
                        subcategory.id
                    );

                const selected =
                  Boolean(assignedRule);

                const saving =
                  saveGroupPermissionMutation.isPending ||
                  removeGroupPermissionMutation.isPending;

                return (
                  <div
                    key={subcategory.id}
                    className={[
                      "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
                      selected
                        ? "border-orange-500/50 bg-orange-500/10"
                        : "border-zinc-800 bg-zinc-950/60",
                    ].join(" ")}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={saving}
                        onChange={() => {
                          if (
                            !selectedGroup
                          ) {
                            return;
                          }

                          if (selected) {
                            removeGroupPermissionMutation.mutate(
                              {
                                groupId:
                                  selectedGroup.id,
                                resourceType:
                                  "SUBCATEGORY",
                                resourceId:
                                  subcategory.id,
                              }
                            );

                            return;
                          }

                          saveGroupPermissionMutation.mutate(
                            {
                              groupId:
                                selectedGroup.id,
                              resourceType:
                                "SUBCATEGORY",
                              resourceId:
                                subcategory.id,
                              accessLevel:
                                "VIEWER",
                            }
                          );
                        }}
                        className="h-4 w-4 accent-orange-500"
                      />

                      <span className="text-sm text-white">
                        {subcategory.label}
                      </span>
                    </label>

                    {selected && (
                      <select
                        value={
                          assignedRule?.access_level ||
                          "VIEWER"
                        }
                        disabled={saving}
                        onChange={(event) => {
                          if (
                            !selectedGroup
                          ) {
                            return;
                          }

                          saveGroupPermissionMutation.mutate(
                            {
                              groupId:
                                selectedGroup.id,
                              resourceType:
                                "SUBCATEGORY",
                              resourceId:
                                subcategory.id,
                              accessLevel:
                                event.target
                                  .value as
                                  | "VIEWER"
                                  | "APPROVER"
                                  | "EDITOR",
                            }
                          );
                        }}
                        className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
                      >
                        <option value="VIEWER">
                          Puede ver
                        </option>

                        <option value="APPROVER">
                          Puede aprobar
                        </option>

                        <option value="EDITOR">
                          Puede editar
                        </option>
                      </select>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>
      );
    })}
  </div>
</section>

   <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
  <div className="mb-4">
    <h4 className="font-semibold text-white">
      Archivos específicos
    </h4>

    <p className="mt-1 text-xs text-zinc-400">
      Selecciona videos o documentos concretos
      que podrá visualizar este grupo.
    </p>
  </div>

  <input
    type="text"
    value={permissionUploadSearch}
    onChange={(event) =>
      setPermissionUploadSearch(
        event.target.value
      )
    }
    placeholder="Buscar archivo por título, nombre, categoría o subcategoría…"
    className="mb-4 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70"
  />

  {loadingPermissionUploads ||
  groupPermissionsLoading ? (
    <div className="p-6 text-center text-sm text-zinc-400">
      Cargando archivos...
    </div>
  ) : permissionUploadsError ? (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      {permissionUploadsQueryError instanceof Error
        ? permissionUploadsQueryError.message
        : "No se pudieron cargar los archivos."}
    </div>
  ) : (
    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {filteredPermissionUploads.map(
        (upload) => {
          const assignedRule =
            groupPermissionsData?.uploads?.find(
              (rule) =>
                rule.resource_id ===
                upload.id
            );

          const selected =
            Boolean(assignedRule);

          const saving =
            saveGroupPermissionMutation.isPending ||
            removeGroupPermissionMutation.isPending;

          return (
            <div
              key={upload.id}
              className={[
                "rounded-xl border p-3 transition",
                selected
                  ? "border-orange-500/60 bg-orange-500/10"
                  : "border-zinc-800 bg-black/30",
              ].join(" ")}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={saving}
                    onChange={() => {
                      if (
                        !selectedGroup
                      ) {
                        return;
                      }

                      if (selected) {
                        removeGroupPermissionMutation.mutate(
                          {
                            groupId:
                              selectedGroup.id,
                            resourceType:
                              "UPLOAD",
                            resourceId:
                              upload.id,
                          }
                        );

                        return;
                      }

                      saveGroupPermissionMutation.mutate(
                        {
                          groupId:
                            selectedGroup.id,
                          resourceType:
                            "UPLOAD",
                          resourceId:
                            upload.id,
                          accessLevel:
                            "VIEWER",
                        }
                      );
                    }}
                    className="mt-1 h-4 w-4 accent-orange-500"
                  />

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {upload.display_name ||
                        upload.titulo ||
                        upload.file_name ||
                        "Archivo sin nombre"}
                    </span>

                    <span className="mt-1 block text-xs text-zinc-500">
                      {upload.tipo ||
                        "archivo"}

                      {" · "}

                      {upload.category ||
                        "Sin categoría"}

                      {upload.subcategory
                        ? ` / ${upload.subcategory}`
                        : ""}
                    </span>
                  </span>
                </label>

                {selected && (
                  <select
                    value={
                      assignedRule?.access_level ||
                      "VIEWER"
                    }
                    disabled={saving}
                    onChange={(event) => {
                      if (
                        !selectedGroup
                      ) {
                        return;
                      }

                      saveGroupPermissionMutation.mutate(
                        {
                          groupId:
                            selectedGroup.id,
                          resourceType:
                            "UPLOAD",
                          resourceId:
                            upload.id,
                          accessLevel:
                            event.target
                              .value as
                              | "VIEWER"
                              | "APPROVER"
                              | "EDITOR",
                        }
                      );
                    }}
                    className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
                  >
                    <option value="VIEWER">
                      Puede ver
                    </option>

                    <option value="APPROVER">
                      Puede aprobar
                    </option>

                    <option value="EDITOR">
                      Puede editar
                    </option>
                  </select>
                )}
              </div>
            </div>
          );
        }
      )}

      {filteredPermissionUploads.length ===
        0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
          No encontramos archivos con esa búsqueda.
        </div>
      )}
    </div>
  )}
</section>
  </div>
)}
            </div>




            <div className="flex justify-end border-t border-zinc-800 p-4">
              <button
                type="button"
                onClick={closeMembersModal}
                disabled={
                  addMembersMutation.isPending ||
                  removeMemberMutation.isPending
                }
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {invitePanelOpen && (
  <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
    <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">
            Registro privado
          </p>

          <h2 className="mt-1 text-xl font-bold text-white">
            Invitar usuario
          </h2>

          <p className="mt-1 text-sm text-zinc-400">
            Genera un enlace único y de un solo uso.
          </p>
        </div>

        <button
          type="button"
          onClick={closeInvitePanel}
          className="text-2xl text-zinc-400 transition hover:text-white"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
            <label>
              <span className="mb-1 block text-xs text-zinc-400">
                Correo autorizado
              </span>

              <input
                type="email"
                value={inviteEmail}
                onChange={(event) =>
                  setInviteEmail(
                    event.target.value
                  )
                }
                placeholder="correo@empresa.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-orange-500/70"
              />

              <span className="mt-1 block text-[11px] text-zinc-500">
                Déjalo vacío para permitir cualquier correo.
              </span>
            </label>

            <label>
              <span className="mb-1 block text-xs text-zinc-400">
                Vencimiento
              </span>

              <select
                value={inviteExpiresInHours}
                onChange={(event) =>
                  setInviteExpiresInHours(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500/70"
              >
                <option value={24}>
                  24 horas
                </option>

                <option value={72}>
                  3 días
                </option>

                <option value={168}>
                  7 días
                </option>

                <option value={720}>
                  30 días
                </option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleCreateInvite}
              disabled={
                createInviteMutation.isPending
              }
              className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createInviteMutation.isPending
                ? "Generando..."
                : "Generar enlace"}
            </button>
          </div>

          {inviteMessage && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-zinc-300">
              {inviteMessage}
            </div>
          )}

          {generatedInviteUrl && (
            <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-300">
                Enlace listo
              </p>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={generatedInviteUrl}
                  readOnly
                  onFocus={(event) =>
                    event.currentTarget.select()
                  }
                  className="min-w-0 flex-1 rounded-lg border border-green-500/30 bg-black/40 px-3 py-2 text-xs text-green-200 outline-none"
                />

                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-300 transition hover:bg-green-500/20"
                >
                  Copiar enlace
                </button>
              </div>

              <p className="mt-2 text-xs text-green-200/70">
                El token completo solo se muestra ahora. Guárdalo o envíalo antes de cerrar.
              </p>
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">
                Historial de invitaciones
              </h3>

              <p className="text-xs text-zinc-500">
                Pendientes, utilizadas y vencidas.
              </p>
            </div>

            <span className="text-xs text-zinc-500">
              {invitesData?.total ?? 0} invitaciones
            </span>
          </div>

          {invitesLoading ? (
            <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-400">
              Cargando invitaciones...
            </div>
          ) : invitesError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {invitesQueryError instanceof Error
                ? invitesQueryError.message
                : "No se pudieron cargar las invitaciones."}
            </div>
          ) : !invitesData?.rows?.length ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
              Todavía no existen invitaciones.
            </div>
          ) : (
            <div className="space-y-3">
              {invitesData.rows.map(
                (invite) => {
                  const isUsed =
                    Boolean(invite.used_at);

                  const isRevoked =
                    Boolean(
                      invite.revoked_at
                    );

                  const isExpired =
                    !isUsed &&
                    !isRevoked &&
                    new Date(
                      invite.expires_at
                    ).getTime() <
                      Date.now();

                  const statusLabel =
                    isUsed
                      ? "Utilizada"
                      : isRevoked
                        ? "Revocada"
                        : isExpired
                          ? "Vencida"
                          : "Pendiente";

                  const statusClass =
                    isUsed
                      ? "border-green-500/30 bg-green-500/10 text-green-300"
                      : isRevoked
                        ? "border-red-500/30 bg-red-500/10 text-red-300"
                        : isExpired
                          ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                          : "border-orange-500/30 bg-orange-500/10 text-orange-300";

                  return (
                    <article
                      key={invite.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-white">
                            {invite.email ||
                              "Cualquier correo autorizado"}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            Creada:{" "}
                            {new Intl.DateTimeFormat(
                              "es-CL",
                              {
                                dateStyle:
                                  "medium",
                                timeStyle:
                                  "short",
                              }
                            ).format(
                              new Date(
                                invite.created_at
                              )
                            )}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            Vence:{" "}
                            {new Intl.DateTimeFormat(
                              "es-CL",
                              {
                                dateStyle:
                                  "medium",
                                timeStyle:
                                  "short",
                              }
                            ).format(
                              new Date(
                                invite.expires_at
                              )
                            )}
                          </p>

                          {invite.used_at && (
                            <p className="mt-1 text-xs text-green-300">
                              Usada por:{" "}
                              {invite.used_by_name ||
                                invite.used_by_email ||
                                "Usuario registrado"}
                            </p>
                          )}
                        </div>

                       <div className="flex shrink-0 flex-col items-end gap-2">
  <span
    className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs ${statusClass}`}
  >
    {statusLabel}
  </span>

  {!isUsed &&
    !isRevoked &&
    !isExpired && (
      <button
        type="button"
        onClick={() =>
          handleRevokeInvite(invite)
        }
        disabled={
          revokeInviteMutation.isPending
        }
        className="text-xs font-medium text-red-300 transition hover:text-red-200 disabled:opacity-50"
      >
        Cancelar invitación
      </button>
    )}
</div>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>

      <div className="flex justify-end border-t border-zinc-800 p-4">
        <button
          type="button"
          onClick={closeInvitePanel}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
)}

      {selectedUserId && (
  <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm">
    <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">
            Control administrativo
          </p>

          <h2 className="mt-1 text-xl font-bold text-white">
            Detalle del usuario
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setSelectedUserId(null)}
          className="text-2xl text-zinc-400 transition hover:text-white"
          aria-label="Cerrar detalle"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {selectedUserDetailLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
            Cargando detalle del usuario...
          </div>
        ) : selectedUserDetailError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {selectedUserDetailQueryError instanceof Error
              ? selectedUserDetailQueryError.message
              : "No se pudo cargar el detalle del usuario."}
          </div>
        ) : selectedUserDetail ? (
          <div className="space-y-6">
            {/* Información general */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={`https://i.pravatar.cc/96?u=${encodeURIComponent(
                      selectedUserDetail.user.email
                    )}`}
                    alt={
                      selectedUserDetail.user.name ||
                      selectedUserDetail.user.email
                    }
                    className="h-16 w-16 rounded-full border border-zinc-700 object-cover"
                  />

                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {selectedUserDetail.user.name || "Sin nombre"}
                    </h3>

                    <p className="text-sm text-zinc-400">
                      {selectedUserDetail.user.email}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-300">
                        {ROLE_LABELS[
                          selectedUserDetail.user.role as UserRole
                        ] || selectedUserDetail.user.role}
                      </span>

                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${
                          selectedUserDetail.user.is_active
                            ? "border-green-500/30 bg-green-500/10 text-green-300"
                            : "border-zinc-700 bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {selectedUserDetail.user.is_active
                          ? "Activo"
                          : "Inactivo"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-zinc-400">
                  Registro:{" "}
                  {dateFormatter.format(
                    new Date(selectedUserDetail.user.created_at)
                  )}
                </div>
              </div>
            </section>

            {/* Estadísticas */}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ["Archivos subidos", selectedUserDetail.stats.totalUploads],
                ["Públicos", selectedUserDetail.stats.publicUploads],
                ["Privados", selectedUserDetail.stats.restrictedUploads],
                [
                  "Accesos recibidos",
                  selectedUserDetail.stats.receivedAccessCount,
                ],
                [
                  "Personas compartidas",
                  selectedUserDetail.stats.totalPeopleShared,
                ],
                ["Grupos", selectedUserDetail.stats.groupCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <p className="text-xs text-zinc-500">{label}</p>

                  <p className="mt-1 text-2xl font-bold text-white">
                    {value}
                  </p>
                </div>
              ))}
            </section>

            {/* Grupos */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h3 className="font-semibold text-white">
                Grupos del usuario
              </h3>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedUserDetail.groups?.length ? (
                  selectedUserDetail.groups.map((group: any) => (
                    <span
                      key={group.id}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: group.color || "#f97316",
                        }}
                      />

                      {group.name}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">
                    Este usuario no pertenece a ningún grupo.
                  </p>
                )}
              </div>
            </section>

            {/* Archivos subidos */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4">
                <h3 className="font-semibold text-white">
                  Archivos subidos
                </h3>

                <p className="mt-1 text-xs text-zinc-400">
                  Revisa su visibilidad, categoría y personas autorizadas.
                </p>
              </div>

              {!selectedUserDetail.uploads?.length ? (
                <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
                  Este usuario no ha subido archivos.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedUserDetail.uploads.map((upload: any) => (
                    <article
                      key={upload.id}
                      className="rounded-xl border border-zinc-800 bg-black/30 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">
                            {upload.display_name ||
                              upload.file_name ||
                              "Archivo sin nombre"}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            {upload.category || "Sin categoría"}
                            {upload.subcategory
                              ? ` / ${upload.subcategory}`
                              : ""}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] ${
                                upload.visibility === "RESTRICTED"
                                  ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                                  : "border-green-500/30 bg-green-500/10 text-green-300"
                              }`}
                            >
                              {upload.visibility === "RESTRICTED"
                                ? "Privado"
                                : "Público"}
                            </span>

                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400">
                              {upload.shared_people_count || 0} personas
                            </span>

                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400">
                              {upload.views || 0} vistas
                            </span>
                          </div>
                        </div>

                        <a
                          href={`/videos/${upload.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-xs text-orange-300 transition hover:bg-orange-500/20"
                        >
                          Ver archivo
                        </a>
                      </div>

                      {upload.shared_with?.length > 0 && (
                        <div className="mt-4 border-t border-zinc-800 pt-3">
                          <p className="mb-2 text-xs font-medium text-zinc-400">
                            Personas con acceso
                          </p>

                          <div className="flex flex-wrap gap-2">
                            {upload.shared_with.map((person: any) => (
                              <span
                                key={person.id}
                                title={person.email}
                                className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300"
                              >
                                {person.name || person.email}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Accesos recibidos */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h3 className="font-semibold text-white">
                Archivos privados recibidos
              </h3>

              <div className="mt-4 space-y-3">
                {selectedUserDetail.receivedAccess?.length ? (
                  selectedUserDetail.receivedAccess.map((access: any) => (
                    <article
                      key={`${access.id}-${access.access_created_at}`}
                      className="rounded-xl border border-zinc-800 bg-black/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">
                            {access.display_name ||
                              access.file_name ||
                              "Archivo sin nombre"}
                          </p>

                          <p className="mt-1 text-xs text-zinc-400">
                            Propietario:{" "}
                            {access.owner_name ||
                              access.owner_email ||
                              "No identificado"}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            Acceso concedido por:{" "}
                            {access.assigned_by_name ||
                              access.assigned_by_email ||
                              "No identificado"}
                          </p>
                        </div>

                        <a
                          href={`/videos/${access.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs text-orange-300 hover:text-orange-200"
                        >
                          Abrir
                        </a>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">
                    No ha recibido accesos privados.
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end border-t border-zinc-800 p-4">
        <button
          type="button"
          onClick={() => setSelectedUserId(null)}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}