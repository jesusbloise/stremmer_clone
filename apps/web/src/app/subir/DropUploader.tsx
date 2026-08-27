"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CreatableCombobox from "@/components/CreatableCombobox";

type Category = {
  id: string;
  slug: string;
  label: string;
  description?: string;
  cover?: string;
  is_active: boolean;
  sort_order: number;
  subcategories: {
    id: string;
    label: string;
    is_active: boolean;
    sort_order: number;
  }[];
};

type UploadMeta = {
  titulo?: string;
  marca?: string;
  agencia?: string;
  productora?: string;
  contacto?: string;
  oficina?: "Chile" | "Mexico" | "";
  tipo?: string[];
  estudio?: string;
  director?: string;
  productor?: string;
  produccion?: string;
  corporativo?: string;
  nuevosNegocios?: string;
  otros?: string;
  duracion?: string | null;
  formato?: string | null;
  version?: string | null;
  fecha?: string | null;
};
type FichaTecnicaOptions = {
  marca: string[];
  agencia: string[];
  productora: string[];
  duracion: string[];
  formato: string[];
  version: string[];
  produccion: string[];
  corporativo: string[];
  nuevosNegocios: string[];
};
type LocalThumbnailCandidate = {
  previewUrl: string;
  file: File;
  timeSec: number;
};
type UploadVisibility = "PUBLIC" | "RESTRICTED";

type UploadAccessLevel = "VIEWER" | "APPROVER" | "EDITOR";

type AssignedUploadUser = {
  userId: string;
  accessLevel: UploadAccessLevel;
};

type AvailableUser = {
  id: string;
  name: string | null;
  email: string | null;
  role?: string | null;
  is_active?: boolean;
};

type AssignedUploadGroup = {
  groupId: string;
  accessLevel: UploadAccessLevel;
};

type AvailableGroup = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  member_count: number;
};

const FALLBACK_CATEGORIES: Category[] = [
  {
    id: "fallback-publicidad",
    slug: "publicidad",
    label: "Publicidad",
    description: "Piezas y campañas publicitarias.",
    cover: "/Publicidad.avif",
    is_active: true,
    sort_order: 1,
    subcategories: [
      { id: "marca", label: "Marca", is_active: true, sort_order: 1 },
      { id: "agencia", label: "Agencia", is_active: true, sort_order: 2 },
      { id: "productora", label: "Productora", is_active: true, sort_order: 3 },
      { id: "contacto", label: "Contacto", is_active: true, sort_order: 4 },
      { id: "oficina", label: "Oficina", is_active: true, sort_order: 5 },
      { id: "tipo", label: "Tipo", is_active: true, sort_order: 6 },
    ],
  },
];

const TIPO_OPTIONS = [
  "Color",
  "3D",
  "IA",
  "Musica",
  "Sonido",
  "VFX",
  "Edicion",
  "Motion",
  "Dailies",
  "Master & Deliveries",
] as const;
const OFICINA_OPTIONS = ["Chile", "Mexico"] as const;
const EMPTY_FICHA_OPTIONS: FichaTecnicaOptions = {
  marca: ["N/A"],
  agencia: ["N/A"],
  productora: ["N/A"],
  duracion: ["N/A"],
  formato: ["N/A"],
  version: ["N/A"],
  produccion: ["N/A"],
  corporativo: ["N/A"],
  nuevosNegocios: ["N/A"],
};
const AUTOCOMPLETE_FIELDS = new Set<keyof UploadMeta>([
  "marca",
  "agencia",
  "productora",
  "duracion",
  "formato",
  "version",
  "produccion",
  "corporativo",
  "nuevosNegocios",
]);
const TEXT_FIELDS: Array<{ key: keyof UploadMeta; label: string; placeholder?: string }> = [
  { key: "titulo", label: "Título", placeholder: "Ej: Campaña Verano 2026 - Master" },
  { key: "marca", label: "Marca" },
  { key: "agencia", label: "Agencia" },
  { key: "productora", label: "Productora" },
  { key: "contacto", label: "Contacto" },

  { key: "duracion", label: "Duración", placeholder: "Ej: 00:30 / 1:20 / 2 min" },
  { key: "formato", label: "Formato", placeholder: "Ej: 16:9 / 9:16 / 4:5 / 1:1" },
  { key: "version", label: "Versión", placeholder: "Ej: V1 / V2 / Master / Final" },
  { key: "fecha", label: "Fecha", placeholder: "Ej: 09-06-2026" },

  { key: "produccion", label: "Producción" },
  { key: "corporativo", label: "Corporativo" },
  { key: "nuevosNegocios", label: "Nuevos Negocios" },
];

const LARGE_FILE_THRESHOLD_MB = 30;

const DEFAULT_CAT = "publicidad";

function normalizeFechaForSave(value?: string | null) {
  if (!value) return null;

  const s = String(value).trim();

  // Si viene como DD-MM-YYYY, lo guarda como YYYY-MM-DD
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Si ya viene como YYYY-MM-DD, lo deja igual
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return s;

  return s;
}

export default function DropUploader({
  onUploaded,
  accept = ".mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a,.jpg,.jpeg,.png,.gif,.webp,.avif,.pdf,.doc,.docx,.txt",
  maxSizeMB = 30720,
}: {
  onUploaded?: (payload: { id?: string; category: string }) => void;
  accept?: string;
  maxSizeMB?: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [fichaOptions, setFichaOptions] =
    useState<FichaTecnicaOptions>(EMPTY_FICHA_OPTIONS);

  const [loadingFichaOptions, setLoadingFichaOptions] = useState(true);

  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailCandidates, setThumbnailCandidates] = useState<LocalThumbnailCandidate[]>([]);
  const [thumbnailLoadingCandidates, setThumbnailLoadingCandidates] = useState(false);
  const [selectedThumbnailPreview, setSelectedThumbnailPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<UploadVisibility>("PUBLIC");

  const [requiresApproval, setRequiresApproval] =
    useState(false);

  const [assignedUsers, setAssignedUsers] =
    useState<AssignedUploadUser[]>([]);

  const [availableUsers, setAvailableUsers] =
    useState<AvailableUser[]>([]);

  const [loadingUsers, setLoadingUsers] =
    useState(false);

  const [assignedGroups, setAssignedGroups] =
  useState<AssignedUploadGroup[]>([]);

const [availableGroups, setAvailableGroups] =
  useState<AvailableGroup[]>([]);

const [loadingGroups, setLoadingGroups] =
  useState(false);

  const [category, setCategory] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_CAT;
    return localStorage.getItem("uploadCategoryV3") || DEFAULT_CAT;
  });

  const [subcategory, setSubcategory] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const storedCat = localStorage.getItem("uploadCategoryV3") || DEFAULT_CAT;
    return localStorage.getItem(`uploadSub_${storedCat}`) || "";
  });

  const [meta, setMeta] = useState<UploadMeta>({
    titulo: "",
    oficina: "",
    tipo: [],
  });

  useEffect(() => {
    let alive = true;

    async function loadFichaOptions() {
      try {
        setLoadingFichaOptions(true);

        const response = await fetch("/api/fichas/opciones", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("No se pudieron cargar las opciones de ficha");
        }

        const result = await response.json();

        if (!alive) return;

        setFichaOptions({
          marca: Array.isArray(result.marca) ? result.marca : ["N/A"],
          agencia: Array.isArray(result.agencia) ? result.agencia : ["N/A"],
          productora: Array.isArray(result.productora)
            ? result.productora
            : ["N/A"],
          duracion: Array.isArray(result.duracion)
            ? result.duracion
            : ["N/A"],
          formato: Array.isArray(result.formato)
            ? result.formato
            : ["N/A"],
          version: Array.isArray(result.version)
            ? result.version
            : ["N/A"],
          produccion: Array.isArray(result.produccion)
            ? result.produccion
            : ["N/A"],
          corporativo: Array.isArray(result.corporativo)
            ? result.corporativo
            : ["N/A"],
          nuevosNegocios: Array.isArray(result.nuevosNegocios)
            ? result.nuevosNegocios
            : ["N/A"],
        });
      } catch (error) {
        console.error("Error cargando opciones para la subida:", error);

        if (alive) {
          setFichaOptions(EMPTY_FICHA_OPTIONS);
        }
      } finally {
        if (alive) {
          setLoadingFichaOptions(false);
        }
      }
    }

    void loadFichaOptions();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
  let alive = true;

  async function loadGroups() {
    try {
      setLoadingGroups(true);

      const response = await fetch("/api/user-groups", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error || "No se pudieron cargar los grupos"
        );
      }

      if (!alive) return;

      const groups: AvailableGroup[] = Array.isArray(result?.rows)
        ? result.rows
        : [];

      setAvailableGroups(
        groups.filter((group) => group.is_active !== false)
      );
    } catch (error) {
      console.error(
        "Error cargando grupos para privacidad:",
        error
      );

      if (alive) {
        setAvailableGroups([]);
      }
    } finally {
      if (alive) {
        setLoadingGroups(false);
      }
    }
  }

  void loadGroups();

  return () => {
    alive = false;
  };
}, []);

  useEffect(() => {
    let alive = true;

    async function loadCategories() {
      try {
        setLoadingCategories(true);

        const res = await fetch("/api/categories", {
          cache: "no-store",
        });

        const data = await res.json();

        const list: Category[] = Array.isArray(data?.categories)
          ? data.categories
          : [];

        if (!alive) return;

        const finalList = list.length ? list : FALLBACK_CATEGORIES;
        setCategories(finalList);

        const stored = localStorage.getItem("uploadCategoryV3") || "";
        const exists = finalList.some((c) => c.slug === stored);

        if (!exists) {
          const first = finalList[0]?.slug || DEFAULT_CAT;
          setCategory(first);
          localStorage.setItem("uploadCategoryV3", first);
        }
      } catch (err) {
        console.error("Error cargando categorías:", err);

        if (alive) {
          setCategories(FALLBACK_CATEGORIES);
        }
      } finally {
        if (alive) setLoadingCategories(false);
      }
    }

    loadCategories();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadUsers() {
      try {
        setLoadingUsers(true);

        const response = await fetch("/api/users?page=1&limit=50", {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.error || "No se pudieron cargar los usuarios");
        }

        if (!alive) return;

        const users: AvailableUser[] = Array.isArray(result?.rows)
          ? result.rows
          : [];

        setAvailableUsers(
          users.filter((user) => user.is_active !== false)
        );
      } catch (error) {
        console.error("Error cargando usuarios para privacidad:", error);

        if (alive) {
          setAvailableUsers([]);
        }
      } finally {
        if (alive) {
          setLoadingUsers(false);
        }
      }
    }

    void loadUsers();

    return () => {
      alive = false;
    };
  }, []);
  const activeCategory = useMemo(() => {
    return categories.find((c) => c.slug === category) || categories[0] || null;
  }, [categories, category]);

  const subcats = useMemo(() => {
    return (activeCategory?.subcategories || []).filter((s) => s.is_active);
  }, [activeCategory]);

  const requiresSub = subcats.length > 0;
  const titleRequired = true;

  useEffect(() => {
    if (!category) return;

    localStorage.setItem("uploadCategoryV3", category);

    const key = `uploadSub_${category}`;
    const saved = localStorage.getItem(key) || "";
    const exists = subcats.some((s) => s.label === saved);

    setSubcategory(exists ? saved : "");
  }, [category, subcats]);

  useEffect(() => {
    if (subcategory && requiresSub) {
      localStorage.setItem(`uploadSub_${category}`, subcategory);
    }
  }, [subcategory, category, requiresSub]);

  const setMetaField = (k: keyof UploadMeta, v: any) =>
    setMeta((p) => ({ ...(p ?? {}), [k]: v }));

  function getOptionsForField(key: keyof UploadMeta): string[] {
    switch (key) {
      case "marca":
        return fichaOptions.marca;

      case "agencia":
        return fichaOptions.agencia;

      case "productora":
        return fichaOptions.productora;

      case "duracion":
        return fichaOptions.duracion;

      case "formato":
        return fichaOptions.formato;

      case "version":
        return fichaOptions.version;

      case "produccion":
        return fichaOptions.produccion;

      case "corporativo":
        return fichaOptions.corporativo;

      case "nuevosNegocios":
        return fichaOptions.nuevosNegocios;

      default:
        return [];
    }
  }

  const toggleTipo = (opt: (typeof TIPO_OPTIONS)[number]) => {
    setMeta((prev) => {
      const cur = new Set(prev.tipo ?? []);
      if (cur.has(opt)) cur.delete(opt);
      else cur.add(opt);
      return { ...prev, tipo: Array.from(cur) };
    });
  };

  const toggleAssignedUser = (userId: string) => {
    setAssignedUsers((current) => {
      const alreadyAssigned = current.some(
        (assignedUser) => assignedUser.userId === userId
      );

      if (alreadyAssigned) {
        return current.filter(
          (assignedUser) => assignedUser.userId !== userId
        );
      }

      return [
        ...current,
        {
          userId,
          accessLevel: "VIEWER",
        },
      ];
    });
  };
  const changeAssignedUserAccess = (
    userId: string,
    accessLevel: UploadAccessLevel
  ) => {
    setAssignedUsers((current) =>
      current.map((assignedUser) =>
        assignedUser.userId === userId
          ? {
            ...assignedUser,
            accessLevel,
          }
          : assignedUser
      )
    );
  };

  const toggleAssignedGroup = (
  groupId: string
) => {
  setAssignedGroups((current) => {
    const alreadyAssigned =
      current.some(
        (assignedGroup) =>
          assignedGroup.groupId === groupId
      );

    if (alreadyAssigned) {
      return current.filter(
        (assignedGroup) =>
          assignedGroup.groupId !== groupId
      );
    }

    return [
      ...current,
      {
        groupId,
        accessLevel: "VIEWER",
      },
    ];
  });
};

const changeAssignedGroupAccess = (
  groupId: string,
  accessLevel: UploadAccessLevel
) => {
  setAssignedGroups((current) =>
    current.map((assignedGroup) =>
      assignedGroup.groupId === groupId
        ? {
            ...assignedGroup,
            accessLevel,
          }
        : assignedGroup
    )
  );
};

useEffect(() => {
  if (visibility === "PUBLIC") {
    setAssignedUsers([]);
    setAssignedGroups([]);
  }
}, [visibility]);

  const openPicker = () => inputRef.current?.click();

  const handleSelect = (f: File) => {
    if (!f) return;

    if (f.size > maxSizeMB * 1024 * 1024) {
      setMsg(`El archivo supera ${maxSizeMB}MB`);
      return;
    }

    setMsg(null);
    setFile(f);
    setThumbnailFile(null);
    setSelectedThumbnailPreview(null);
    setThumbnailCandidates([]);

    setMeta((prev) => {
      const hasTitle = !!(prev.titulo && String(prev.titulo).trim());
      if (hasTitle) return prev;
      const base = f.name.replace(/\.[^/.]+$/, "");
      return { ...prev, titulo: base };
    });

    if (isVideoFile(f)) {
      generateLocalThumbnailCandidates(f).catch((err) => {
        setThumbnailLoadingCandidates(false);
        setMsg(`No se pudieron generar capturas: ${err?.message || "error"}`);
      });
    }
  };
 const uploadDisabled =
  !file ||
  uploading ||
  loadingCategories ||
  !category ||
  (requiresSub && !subcategory) ||
  (titleRequired && !(meta.titulo && meta.titulo.trim().length > 0)) ||
  (
    visibility === "RESTRICTED" &&
    assignedUsers.length === 0 &&
    assignedGroups.length === 0
  );

  const uploadThumbnailIfNeeded = async (uploadId?: string) => {
    if (!uploadId || !thumbnailFile) return;

    const fd = new FormData();
    fd.append("file", thumbnailFile);

    const res = await fetch(`/api/uploads/${uploadId}/thumbnail`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "El archivo subió, pero falló la portada");
    }
  };


  function isVideoFile(f?: File | null) {
    if (!f) return false;
    return (
      f.type.startsWith("video/") ||
      /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(f.name)
    );
  }
  async function generateLocalThumbnailCandidates(videoFile: File) {
    setThumbnailLoadingCandidates(true);
    setThumbnailCandidates([]);
    setThumbnailModalOpen(true);
    setMsg("Generando capturas del video...");

    const objectUrl = URL.createObjectURL(videoFile);
    const video = document.createElement("video");

    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video"));
    });

    const duration = video.duration || 0;
    const times = [0.15, 0.3, 0.45, 0.6, 0.75].map((p) =>
      Math.max(1, Math.floor(duration * p))
    );

    const results: LocalThumbnailCandidate[] = [];

    for (const timeSec of times) {
      await new Promise<void>((resolve) => {
        video.currentTime = Math.min(timeSec, Math.max(duration - 1, 1));
        video.onseeked = () => resolve();
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9);
      });

      if (!blob) continue;

      const file = new File([blob], `portada-${timeSec}s.jpg`, {
        type: "image/jpeg",
      });

      results.push({
        previewUrl: URL.createObjectURL(blob),
        file,
        timeSec,
      });
    }

    URL.revokeObjectURL(objectUrl);

    setThumbnailCandidates(results);
    setThumbnailLoadingCandidates(false);
    setMsg(results.length ? "Elige una portada o sube una imagen propia." : null);
  }

  const upload = async () => {
    if (!file || uploading) return;
    if (!category) return setMsg("Selecciona una categoría.");
    if (requiresSub && !subcategory) return setMsg("Selecciona una subcategoría.");

   if (titleRequired && !(meta.titulo && meta.titulo.trim())) {
  return setMsg("Completa el Título.");
}

if (
  visibility === "RESTRICTED" &&
  assignedUsers.length === 0 &&
  assignedGroups.length === 0
) {
  return setMsg(
    "Selecciona al menos una persona o un grupo para el archivo restringido."
  );
}
try {
  setUploading(true);

      const metaForUpload = {
        ...meta,
        fecha: normalizeFechaForSave(meta.fecha),
      };

      const isLarge = file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024;

      if (!isLarge) {
        setMsg("Subiendo archivo...");

      const fd = new FormData();

fd.append("file", file);
fd.append("category", category);
fd.append("subcategory", requiresSub ? subcategory : "");
fd.append("ficha", JSON.stringify(metaForUpload));

fd.append("visibility", visibility);
fd.append("requiresApproval", String(requiresApproval));
fd.append("assignedUsers", JSON.stringify(assignedUsers));
fd.append(
  "assignedGroups",
  JSON.stringify(assignedGroups)
);

        const res = await fetch("/api/upload-minio", {
          method: "POST",
          body: fd,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        const id: string | undefined =
          data?.id ||
          data?.upload?.id ||
          data?.file?.id ||
          data?.record?.id;

        if (thumbnailFile) {
          await uploadThumbnailIfNeeded(id);
        }

        setMsg("Subido correctamente");
        setFile(null);
        setThumbnailFile(null);
        setSelectedThumbnailPreview(null);
        setThumbnailCandidates([]);
        setThumbnailModalOpen(false);

        onUploaded?.({ id, category });
        return;
      }

     setMsg("Preparando subida multipart a R2...");

let multipartUploadId = "";
let multipartFinalizeToken = "";

try {
  const initRes = await fetch("/api/upload-minio", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mode: "multipart-r2-init",
      fileName: file.name,
      contentType:
        file.type ||
        "application/octet-stream",
      size: file.size,
      category,
      subcategory: requiresSub
        ? subcategory
        : "",
      ficha: metaForUpload,
      visibility,
      requiresApproval,
      assignedUsers,
      assignedGroups,
    }),
  });

  const initData = await initRes
    .json()
    .catch(() => ({}));

  if (!initRes.ok) {
    throw new Error(
      initData?.error ||
        `HTTP ${initRes.status}`
    );
  }

  multipartUploadId = String(
    initData?.uploadId || ""
  );

  multipartFinalizeToken = String(
    initData?.finalizeToken || ""
  );

  const partSize = Number(
    initData?.partSize || 0
  );

  const totalParts = Number(
    initData?.totalParts || 0
  );

  if (
    !multipartUploadId ||
    !multipartFinalizeToken ||
    !Number.isFinite(partSize) ||
    partSize <= 0 ||
    !Number.isInteger(totalParts) ||
    totalParts <= 0
  ) {
    throw new Error(
      "R2 no devolvió los datos necesarios para la subida multipart"
    );
  }

  const completedParts: {
    partNumber: number;
    etag: string;
  }[] = [];

  for (
    let partNumber = 1;
    partNumber <= totalParts;
    partNumber++
  ) {
    const start =
      (partNumber - 1) * partSize;

    const end = Math.min(
      start + partSize,
      file.size
    );

    const filePart = file.slice(
      start,
      end
    );

    const progressBefore = Math.floor(
      ((partNumber - 1) /
        totalParts) *
        100
    );

    setMsg(
      `Subiendo película a R2: ${progressBefore}% ` +
        `(${partNumber}/${totalParts})`
    );

    const signRes = await fetch(
      "/api/upload-minio",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          mode:
            "multipart-r2-sign-part",
          uploadId:
            multipartUploadId,
          finalizeToken:
            multipartFinalizeToken,
          partNumber,
        }),
      }
    );

    const signData = await signRes
      .json()
      .catch(() => ({}));

    if (!signRes.ok) {
      throw new Error(
        signData?.error ||
          `No se pudo firmar la parte ${partNumber}`
      );
    }

    const partUploadUrl = String(
      signData?.uploadUrl || ""
    );

    if (!partUploadUrl) {
      throw new Error(
        `No se recibió URL para la parte ${partNumber}`
      );
    }

    const partUploadRes = await fetch(
      partUploadUrl,
      {
        method: "PUT",
        body: filePart,
      }
    );

    if (!partUploadRes.ok) {
      throw new Error(
        `Error subiendo la parte ${partNumber} (${partUploadRes.status})`
      );
    }

    const etag =
      partUploadRes.headers.get("etag") ||
      partUploadRes.headers.get("ETag");

    if (!etag) {
      throw new Error(
        `R2 no devolvió el ETag de la parte ${partNumber}`
      );
    }

    completedParts.push({
      partNumber,
      etag,
    });

    const progressAfter = Math.floor(
      (partNumber / totalParts) *
        100
    );

    setMsg(
      `Subiendo película a R2: ${progressAfter}% ` +
        `(${partNumber}/${totalParts})`
    );
  }

  setMsg(
    "Uniendo las partes del archivo en R2..."
  );

  const completeRes = await fetch(
    "/api/upload-minio",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        mode:
          "multipart-r2-complete",
        uploadId:
          multipartUploadId,
        finalizeToken:
          multipartFinalizeToken,
        parts: completedParts,
      }),
    }
  );

  const completeData =
    await completeRes
      .json()
      .catch(() => ({}));

  if (!completeRes.ok) {
    throw new Error(
      completeData?.error ||
        "No se pudo completar la subida multipart"
    );
  }

  setMsg(
    "Archivo almacenado. Registrando y enviando a Cloudflare Stream..."
  );

  const finalizeRes = await fetch(
    "/api/upload-minio",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        mode: "finalize-direct-r2",
        finalizeToken:
          multipartFinalizeToken,
      }),
    }
  );

  const finalizeData =
    await finalizeRes
      .json()
      .catch(() => ({}));

  if (!finalizeRes.ok) {
    throw new Error(
      finalizeData?.error ||
        `HTTP ${finalizeRes.status}`
    );
  }

  const id: string | undefined =
    finalizeData?.id ||
    finalizeData?.upload?.id ||
    finalizeData?.file?.id ||
    finalizeData?.record?.id;

  if (thumbnailFile) {
    await uploadThumbnailIfNeeded(id);
  }

  setMsg(
    "Subido correctamente. El video está siendo procesado."
  );

  setFile(null);
  setThumbnailFile(null);
  setSelectedThumbnailPreview(null);
  setThumbnailCandidates([]);
  setThumbnailModalOpen(false);

  onUploaded?.({
    id,
    category,
  });
} catch (multipartError) {
  if (
    multipartUploadId &&
    multipartFinalizeToken
  ) {
    await fetch("/api/upload-minio", {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        mode: "multipart-r2-abort",
        uploadId:
          multipartUploadId,
        finalizeToken:
          multipartFinalizeToken,
      }),
    }).catch(() => {});
  }

  throw multipartError;
}
    } catch (e: any) {
      setMsg(`Error: ${e?.message || "falló la subida"}`);
    } finally {
      setUploading(false);
    }
  };

    return (
    <div className="w-full min-h-screen text-white bg-transparent">
      <div className="w-full py-4 border-b border-zinc-800 bg-transparent">
        <div className="px-0">
          <p className="text-sm text-zinc-300 mb-2">
            Guardar en categoría:
          </p>

          {loadingCategories ? (
            <p className="text-sm text-zinc-500">
              Cargando categorías...
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {categories.map((c) => {
                const active = category === c.slug;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.slug)}
                    className={[
                      "rounded-lg border px-3 py-2 text-sm text-left transition",
                      active
                        ? "border-orange-400/70 bg-orange-500/10"
                        : "border-zinc-700/80 bg-transparent hover:bg-white/5",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    <div className="font-medium">{c.label}</div>

                    {c.description && (
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {c.description}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {requiresSub && (
            <div className="mt-3">
              <label className="text-sm text-zinc-300">
                Subcategoría
              </label>

              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-700/80 bg-black text-sm"
              >
                <option value="">
                  Selecciona subcategoría…
                </option>

                {subcats.map((s) => (
                  <option
                    key={s.id}
                    value={s.label}
                    className="bg-black"
                  >
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="w-full py-5 bg-transparent">
        <div className="px-0">
          <h3 className="text-base font-semibold">
            Datos del archivo
          </h3>

          <p className="text-[12px] text-zinc-400 mt-1">
            Completa lo necesario antes de subir.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {TEXT_FIELDS.map(({ key, label, placeholder }) => {
              const usesAutocomplete = AUTOCOMPLETE_FIELDS.has(key);

              if (usesAutocomplete) {
                return (
                  <CreatableCombobox
                    key={String(key)}
                    label={label}
                    value={
                      typeof meta[key] === "string"
                        ? (meta[key] as string)
                        : ""
                    }
                    options={getOptionsForField(key)}
                    onChange={(value) => setMetaField(key, value)}
                    placeholder={
                      loadingFichaOptions
                        ? "Cargando opciones..."
                        : placeholder ||
                          `Seleccionar o escribir ${label.toLowerCase()}...`
                    }
                  />
                );
              }

              return (
                <div
                  key={String(key)}
                  className="flex flex-col"
                >
                  <label className="mb-1 block text-[11px] text-zinc-400">
                    {label}

                    {key === "titulo" && titleRequired && (
                      <span className="ml-1 text-orange-400">
                        *
                      </span>
                    )}
                  </label>

                  <input
                    type={key === "fecha" ? "date" : "text"}
                    value={
                      typeof meta[key] === "string"
                        ? (meta[key] as string)
                        : ""
                    }
                    onChange={(event) =>
                      setMetaField(key, event.target.value)
                    }
                    placeholder={placeholder}
                    className="w-full rounded border border-zinc-700/80 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-orange-500/70"
                  />
                </div>
              );
            })}

            <div className="flex flex-col">
              <label className="block text-[11px] text-zinc-400 mb-1">
                Oficina
              </label>

              <select
                value={meta.oficina ?? ""}
                onChange={(e) =>
                  setMetaField("oficina", e.target.value as any)
                }
                className="w-full px-3 py-2 rounded border border-zinc-700/80 bg-black text-sm"
              >
                <option value="">
                  Selecciona…
                </option>

                {OFICINA_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] text-zinc-400 mb-2">
                Tipo (puede ser una o varias)
              </label>

              <div className="flex flex-wrap gap-2">
                {TIPO_OPTIONS.map((opt) => {
                  const active = (meta.tipo ?? []).includes(opt);

                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleTipo(opt)}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs border transition",
                        active
                          ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                          : "bg-zinc-900 border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 text-[11px] text-zinc-500">
                Seleccionado:{" "}
                <span className="text-zinc-200">
                  {(meta.tipo ?? []).length
                    ? (meta.tipo ?? []).join(", ")
                    : "—"}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] text-zinc-400 mb-1">
                Otros
              </label>

              <textarea
                value={meta.otros ?? ""}
                onChange={(e) =>
                  setMetaField("otros", e.target.value)
                }
                rows={5}
                placeholder="Escribe una descripción, notas, comentarios o información adicional..."
                className="w-full px-3 py-2 rounded border border-zinc-700/80 bg-transparent text-sm placeholder:text-zinc-500 resize-y"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full py-4 bg-transparent">
        <div className="rounded-xl border border-zinc-800/80 bg-black/20 p-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              Privacidad y acceso
            </h3>

            <p className="mt-1 text-xs text-zinc-400">
              Define quién podrá ver este archivo y si necesita
              aprobación.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVisibility("PUBLIC")}
              className={[
                "rounded-xl border p-4 text-left transition",
                visibility === "PUBLIC"
                  ? "border-orange-500/70 bg-orange-500/10"
                  : "border-zinc-700 bg-black/20 hover:border-zinc-500",
              ].join(" ")}
              aria-pressed={visibility === "PUBLIC"}
            >
              <div className="font-medium text-white">
                Público
              </div>

              <div className="mt-1 text-xs text-zinc-400">
                El archivo podrá aparecer en las áreas generales
                de la plataforma.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setVisibility("RESTRICTED")}
              className={[
                "rounded-xl border p-4 text-left transition",
                visibility === "RESTRICTED"
                  ? "border-orange-500/70 bg-orange-500/10"
                  : "border-zinc-700 bg-black/20 hover:border-zinc-500",
              ].join(" ")}
              aria-pressed={visibility === "RESTRICTED"}
            >
              <div className="font-medium text-white">
                Restringido
              </div>

              <div className="mt-1 text-xs text-zinc-400">
                Solo podrán acceder los usuarios que selecciones.
              </div>
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-black/20 p-4">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(event) =>
                setRequiresApproval(event.target.checked)
              }
              className="mt-1 h-4 w-4 accent-orange-500"
            />

            <span>
              <span className="block text-sm font-medium text-white">
                Requiere aprobación
              </span>

              <span className="mt-1 block text-xs text-zinc-400">
                El archivo quedará pendiente hasta que un usuario
                con permiso de aprobación lo revise.
              </span>
            </span>
          </label>

          {visibility === "RESTRICTED" && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Usuarios con acceso
                  </h4>

                  <p className="text-xs text-zinc-400">
                    Selecciona al menos una persona y define su
                    nivel de acceso.
                  </p>
                </div>

                <div className="text-xs text-zinc-400">
                  Seleccionados:{" "}
                  <span className="font-medium text-orange-300">
                    {assignedUsers.length}
                  </span>
                </div>
              </div>

              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {loadingUsers ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                    Cargando usuarios...
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                    No se encontraron usuarios disponibles.
                  </div>
                ) : (
                  availableUsers.map((user) => {
                    const assignedUser = assignedUsers.find(
                      (item) => item.userId === user.id
                    );

                    const selected = Boolean(assignedUser);

                    return (
                      <div
                        key={user.id}
                        className={[
                          "rounded-lg border p-3 transition",
                          selected
                            ? "border-orange-500/60 bg-orange-500/10"
                            : "border-zinc-800 bg-zinc-950/70",
                        ].join(" ")}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex min-w-0 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                toggleAssignedUser(user.id)
                              }
                              className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
                            />

                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white">
                                {user.name || "Usuario sin nombre"}
                              </span>

                              <span className="block truncate text-xs text-zinc-400">
                                {user.email || "Sin correo"}
                              </span>

                              {user.role && (
                                <span className="mt-1 block text-[11px] uppercase tracking-wide text-zinc-500">
                                  {user.role}
                                </span>
                              )}
                            </span>
                          </label>

                          {selected && (
                            <select
                              value={
                                assignedUser?.accessLevel ||
                                "VIEWER"
                              }
                              onChange={(event) =>
                                changeAssignedUserAccess(
                                  user.id,
                                  event.target
                                    .value as UploadAccessLevel
                                )
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-orange-500/70 sm:w-40"
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
                  })
                )}
              </div>
<div className="mt-6 border-t border-zinc-800 pt-5">
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h4 className="text-sm font-semibold text-white">
        Grupos con acceso
      </h4>

      <p className="text-xs text-zinc-400">
        Puedes dar acceso a un grupo completo.
        Todos sus miembros heredarán el acceso.
      </p>
    </div>

    <div className="text-xs text-zinc-400">
      Seleccionados:{" "}
      <span className="font-medium text-orange-300">
        {assignedGroups.length}
      </span>
    </div>
  </div>

  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
    {loadingGroups ? (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        Cargando grupos...
      </div>
    ) : availableGroups.length === 0 ? (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        No hay grupos disponibles.
      </div>
    ) : (
      availableGroups.map((group) => {
        const assignedGroup =
          assignedGroups.find(
            (item) =>
              item.groupId === group.id
          );

        const selected =
          Boolean(assignedGroup);

        return (
          <div
            key={group.id}
            className={[
              "rounded-lg border p-3 transition",
              selected
                ? "border-orange-500/60 bg-orange-500/10"
                : "border-zinc-800 bg-zinc-950/70",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-w-0 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    toggleAssignedGroup(
                      group.id
                    )
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
                />

                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">
                    {group.name}
                  </span>

                  <span className="block text-xs text-zinc-400">
                    {group.member_count}{" "}
                    miembro
                    {group.member_count !== 1
                      ? "s"
                      : ""}
                  </span>

                  {group.description && (
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      {group.description}
                    </span>
                  )}
                </span>
              </label>

              {selected && (
                <select
                  value={
                    assignedGroup?.accessLevel ||
                    "VIEWER"
                  }
                  onChange={(event) =>
                    changeAssignedGroupAccess(
                      group.id,
                      event.target
                        .value as UploadAccessLevel
                    )
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-orange-500/70 sm:w-40"
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
      })
    )}
  </div>

  {!loadingUsers &&
    !loadingGroups &&
    assignedUsers.length === 0 &&
    assignedGroups.length === 0 && (
      <p className="mt-3 text-xs text-orange-300">
        Debes seleccionar al menos una
        persona o un grupo para subir un
        archivo restringido.
      </p>
    )}
</div>
              
            </div>
          )}
        </div>
      </div>

      <div className="w-full py-4 bg-transparent">
        <div className="rounded-xl border border-zinc-800/80 bg-black/20 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Imagen de portada opcional
              </h3>

              <p className="text-xs text-zinc-400 mt-1">
                Puedes elegir una captura del video o subir una
                imagen propia antes de subir el archivo.
              </p>
            </div>

            <button
              type="button"
              disabled={!file || !isVideoFile(file)}
              onClick={() => setThumbnailModalOpen(true)}
              className="inline-flex items-center justify-center rounded-lg border border-orange-500/60 px-4 py-2 text-sm text-orange-300 hover:bg-orange-500/10 disabled:opacity-50"
            >
              Elegir portada
            </button>
          </div>

          {selectedThumbnailPreview && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs text-zinc-400">
                  Portada seleccionada:
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setThumbnailFile(null);
                    setSelectedThumbnailPreview(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Quitar
                </button>
              </div>

              <img
                src={selectedThumbnailPreview}
                alt="Portada seleccionada"
                className="w-full max-w-xs rounded-lg border border-zinc-800 object-cover"
              />
            </div>
          )}
        </div>
      </div>

      <div className="w-full py-5 bg-transparent">
        <div
          role="button"
          aria-label="Zona para subir archivo"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);

            const f = e.dataTransfer.files?.[0];

            if (f) {
              handleSelect(f);
            }
          }}
          className={`w-full min-h-44 sm:min-h-56 lg:min-h-64 rounded-xl border-2 ${
            dragOver
              ? "border-orange-300/80"
              : "border-orange-500/60"
          } bg-transparent hover:bg-white/5 transition grid place-items-center text-center cursor-pointer select-none`}
        >
          <div className="px-4">
            <div className="text-white font-semibold text-base sm:text-lg lg:text-xl truncate">
              {file
                ? file.name
                : "Haz click o arrastra para subir un archivo"}
            </div>

            <div className="text-zinc-400 text-xs sm:text-sm mt-2">
              Video/Documento hasta 30 GB
            </div>

          </div>

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];

              if (f) {
                handleSelect(f);
              }
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 px-0">
          <button
            type="button"
            onClick={upload}
            disabled={uploadDisabled}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-5 py-2 rounded"
          >
            {uploading ? "Subiendo..." : "Subir archivo"}
          </button>

          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setFile(null);
              setThumbnailFile(null);
              setSelectedThumbnailPreview(null);
              setThumbnailCandidates([]);
              setThumbnailModalOpen(false);
              setMsg(null);

              setVisibility("PUBLIC");
              setRequiresApproval(false);
              setAssignedUsers([]);
              setAssignedGroups([]);

              setMeta({
                titulo: "",
                oficina: "",
                tipo: [],
              });

              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            className="px-4 py-2 rounded border border-zinc-700/80 hover:border-zinc-500 text-sm"
          >
            Limpiar archivo
          </button>

          {msg && (
            <div className="text-sm text-zinc-300 break-words">
              {msg}
            </div>
          )}
        </div>
      </div>

      {thumbnailModalOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Elegir portada
                </h2>

                <p className="mt-1 text-xs text-zinc-400">
                  Selecciona una captura del video o sube una
                  imagen propia.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setThumbnailModalOpen(false)}
                className="text-zinc-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-zinc-800 bg-black/30 p-4">
              <p className="mb-3 text-sm text-zinc-300">
                Subir portada personalizada
              </p>

              <label className="inline-flex cursor-pointer rounded-lg border border-orange-500/70 bg-orange-500/10 px-4 py-2 text-sm text-orange-300 hover:bg-orange-500/20 transition">
                Seleccionar imagen

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const img = e.target.files?.[0] || null;

                    if (img && !img.type.startsWith("image/")) {
                      setMsg("La portada debe ser una imagen.");
                      return;
                    }

                    if (img) {
                      const preview = URL.createObjectURL(img);

                      setThumbnailFile(img);
                      setSelectedThumbnailPreview(preview);
                      setThumbnailModalOpen(false);
                    }

                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className="rounded-xl border border-dashed border-zinc-800 bg-black/20 p-4">
              <p className="text-sm text-zinc-300">
                Capturas automáticas del video
              </p>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {thumbnailLoadingCandidates ? (
                  <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-400">
                    Generando capturas del video...
                  </div>
                ) : thumbnailCandidates.length ? (
                  thumbnailCandidates.map((candidate) => (
                    <button
                      key={`${candidate.timeSec}-${candidate.previewUrl}`}
                      type="button"
                      onClick={() => {
                        setThumbnailFile(candidate.file);
                        setSelectedThumbnailPreview(
                          candidate.previewUrl
                        );
                        setThumbnailModalOpen(false);
                      }}
                      className="group relative aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 hover:border-orange-500/70 transition"
                    >
                      <img
                        src={candidate.previewUrl}
                        alt={`Frame ${candidate.timeSec}s`}
                        className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
                      />

                      <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
                        {candidate.timeSec}s
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-400">
                    Selecciona un video para generar capturas.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}