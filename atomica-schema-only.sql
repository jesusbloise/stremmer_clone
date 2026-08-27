--
-- PostgreSQL database dump
--

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'PROFESOR',
    'ESTUDIANTE'
);


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: uploads_set_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uploads_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    access_level text DEFAULT 'VIEWER'::text NOT NULL,
    assigned_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_rules_access_level_check CHECK ((access_level = ANY (ARRAY['VIEWER'::text, 'APPROVER'::text, 'EDITOR'::text]))),
    CONSTRAINT access_rules_resource_type_check CHECK ((resource_type = ANY (ARRAY['CATEGORY'::text, 'SUBCATEGORY'::text, 'UPLOAD'::text]))),
    CONSTRAINT access_rules_target_type_check CHECK ((target_type = ANY (ARRAY['USER'::text, 'GROUP'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    user_id text,
    tenant_id text,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    details text,
    ip_address text,
    user_agent text,
    created_at bigint NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    cover text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    user_id uuid NOT NULL,
    author_name text,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_content_check CHECK (((length(content) >= 1) AND (length(content) <= 1000)))
);


--
-- Name: documentos_texto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_texto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id uuid NOT NULL,
    tipo text NOT NULL,
    texto text,
    video_id text,
    file_name text,
    texto_extraido text,
    creado_en timestamp without time zone DEFAULT now(),
    num_paginas integer,
    num_lineas integer,
    num_palabras integer,
    num_frases integer,
    resumen text,
    posiciones jsonb
);


--
-- Name: ficha_tecnica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ficha_tecnica (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    titulo text,
    director text,
    productor text,
    jefe_produccion text,
    director_fotografia text,
    sonido text,
    direccion_arte text,
    asistente_direccion text,
    montaje text,
    otro_cargo text,
    contacto_principal text,
    correo text,
    curso text,
    profesor text,
    anio integer,
    duracion text,
    sinopsis text,
    proceso_anterior text,
    pendientes text,
    visto boolean,
    reunion timestamp with time zone,
    formato text,
    estado text,
    delivery_estimado text,
    seleccion text,
    link text,
    foto text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    marca text,
    agencia text,
    productora_ficha text,
    contacto text,
    oficina text,
    tipo text[] DEFAULT '{}'::text[],
    estudio text,
    produccion text,
    corporativo text,
    nuevos_negocios text,
    productora text,
    otros text,
    version text,
    fecha text
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type character varying(80),
    title text,
    message text,
    upload_id uuid,
    action_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone,
    banner_dismissed_at timestamp with time zone,
    resolved_at timestamp with time zone
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    generacion text,
    facultad text,
    descripcion text,
    avatar_url text,
    instagram text,
    facebook text,
    whatsapp text,
    participaciones jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registration_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    email text,
    created_by_id uuid,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_id uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scene_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_segments (
    id integer NOT NULL,
    video_id text,
    scene_index integer,
    start_time numeric,
    end_time numeric
);


--
-- Name: scene_segments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scene_segments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transcriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcriptions (
    id integer NOT NULL,
    video_id text,
    start_time numeric,
    end_time numeric,
    text text
);


--
-- Name: transcriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transcriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: upload_access_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_access_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    group_id uuid NOT NULL,
    access_level text DEFAULT 'VIEW'::text NOT NULL,
    assigned_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: upload_access_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_access_users (
    upload_id text NOT NULL,
    user_id uuid NOT NULL,
    access_level text DEFAULT 'VIEWER'::text NOT NULL,
    approval_decision text DEFAULT 'PENDING'::text NOT NULL,
    decision_at timestamp with time zone,
    decision_note text,
    assigned_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: upload_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    access_level text DEFAULT 'VIEWER'::text NOT NULL,
    assigned_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT upload_permissions_access_level_check CHECK ((access_level = ANY (ARRAY['VIEWER'::text, 'APPROVER'::text, 'EDITOR'::text]))),
    CONSTRAINT upload_permissions_target_type_check CHECK ((target_type = ANY (ARRAY['USER'::text, 'GROUP'::text, 'CATEGORY'::text, 'SUBCATEGORY'::text, 'PROJECT'::text])))
);


--
-- Name: upload_share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    token_hash text NOT NULL,
    created_by_id uuid,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_accessed_at timestamp with time zone,
    access_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id text NOT NULL,
    custom_id text,
    file_key text,
    file_name text,
    size_in_bytes bigint,
    status text,
    uploaded_at timestamp without time zone,
    signed_url text,
    file_path text,
    tipo text,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    category text DEFAULT 'otros'::text NOT NULL,
    views integer DEFAULT 0,
    subcategory text,
    vimeo_id text,
    duration_sec integer,
    thumbnail_url text,
    created_by_id text,
    updated_at timestamp with time zone DEFAULT now(),
    streaming_path text,
    storage_provider text DEFAULT 'gcs'::text,
    r2_path text,
    cf_stream_uid text,
    cf_stream_status text,
    cf_stream_ready boolean DEFAULT false,
    cf_stream_playback_url text,
    approved_by_id uuid,
    approved_at timestamp with time zone,
    share_link_mode text DEFAULT 'DISABLED'::text NOT NULL,
    share_link_token_hash text,
    share_link_expires_at timestamp with time zone,
    visibility text DEFAULT 'PUBLIC'::text NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    approval_status text DEFAULT 'NOT_REQUIRED'::text NOT NULL
);


--
-- Name: user_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    color text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'USUARIO'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    two_factor_secret text,
    two_factor_enabled_at timestamp with time zone,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['SUPER_ADMIN'::text, 'ADMIN'::text, 'USUARIO'::text])))
);


--
-- Name: v_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_profiles AS
 SELECT u.id AS user_id,
    u.name,
    u.email,
    u.role,
    p.id AS profile_id,
    p.generacion,
    p.facultad,
    p.descripcion,
    p.avatar_url,
    p.instagram,
    p.facebook,
    p.whatsapp,
    p.participaciones,
    GREATEST(u.created_at, COALESCE(p.updated_at, u.created_at)) AS updated_at
   FROM (public.users u
     LEFT JOIN public.profiles p ON ((p.user_id = u.id)));


--
-- Name: video_frames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_frames (
    id integer NOT NULL,
    video_id uuid NOT NULL,
    frame_number integer,
    time_sec numeric,
    image_data bytea,
    mime_type text DEFAULT 'image/jpeg'::text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: video_frames_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_frames_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_objects (
    id integer NOT NULL,
    video_id uuid NOT NULL,
    frame integer,
    time_sec numeric,
    objects text[],
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: video_objects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_objects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_poses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_poses (
    id integer NOT NULL,
    video_id uuid,
    frame integer,
    rostro_detectado boolean,
    mano_izq_arriba boolean,
    time_sec real,
    l_shoulder_x real,
    l_shoulder_y real,
    l_shoulder_z real,
    l_wrist_x real,
    l_wrist_y real,
    l_wrist_z real,
    frame_path text
);


--
-- Name: video_poses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_poses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_reels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_reels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id text,
    duracion integer,
    archivo bytea,
    created_at timestamp without time zone DEFAULT now(),
    path text
);


--
-- Name: video_subtitulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_subtitulos (
    id integer NOT NULL,
    video_id text,
    time_start real,
    time_end real,
    text text
);


--
-- Name: video_subtitulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_subtitulos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_subtitulos_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.video_subtitulos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.video_subtitulos_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: access_rules access_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_rules
    ADD CONSTRAINT access_rules_pkey PRIMARY KEY (id);


--
-- Name: access_rules access_rules_target_type_target_id_resource_type_resource_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_rules
    ADD CONSTRAINT access_rules_target_type_target_id_resource_type_resource_i_key UNIQUE (target_type, target_id, resource_type, resource_id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: ficha_tecnica ficha_tecnica_upload_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ficha_tecnica
    ADD CONSTRAINT ficha_tecnica_upload_id_key UNIQUE (upload_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: registration_invites registration_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_invites
    ADD CONSTRAINT registration_invites_pkey PRIMARY KEY (id);


--
-- Name: registration_invites registration_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_invites
    ADD CONSTRAINT registration_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: subcategories subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_pkey PRIMARY KEY (id);


--
-- Name: upload_access_groups upload_access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_access_groups
    ADD CONSTRAINT upload_access_groups_pkey PRIMARY KEY (id);


--
-- Name: upload_access_groups upload_access_groups_upload_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_access_groups
    ADD CONSTRAINT upload_access_groups_upload_id_group_id_key UNIQUE (upload_id, group_id);


--
-- Name: upload_access_users upload_access_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_access_users
    ADD CONSTRAINT upload_access_users_pkey PRIMARY KEY (upload_id, user_id);


--
-- Name: upload_permissions upload_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_permissions
    ADD CONSTRAINT upload_permissions_pkey PRIMARY KEY (id);


--
-- Name: upload_permissions upload_permissions_upload_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_permissions
    ADD CONSTRAINT upload_permissions_upload_id_target_type_target_id_key UNIQUE (upload_id, target_type, target_id);


--
-- Name: upload_share_links upload_share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_share_links
    ADD CONSTRAINT upload_share_links_pkey PRIMARY KEY (id);


--
-- Name: upload_share_links upload_share_links_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_share_links
    ADD CONSTRAINT upload_share_links_token_hash_key UNIQUE (token_hash);


--
-- Name: user_group_members user_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_slug_key UNIQUE (slug);


--
-- Name: idx_access_rules_group_resources; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_rules_group_resources ON public.access_rules USING btree (target_id, resource_type, resource_id) WHERE (target_type = 'GROUP'::text);


--
-- Name: idx_access_rules_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_rules_resource ON public.access_rules USING btree (resource_type, resource_id);


--
-- Name: idx_access_rules_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_rules_target ON public.access_rules USING btree (target_type, target_id);


--
-- Name: idx_registration_invites_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_active ON public.registration_invites USING btree (expires_at) WHERE ((used_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: idx_registration_invites_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_created_at ON public.registration_invites USING btree (created_at DESC);


--
-- Name: idx_registration_invites_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_email ON public.registration_invites USING btree (lower(email));


--
-- Name: idx_registration_invites_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_invites_token_hash ON public.registration_invites USING btree (token_hash);


--
-- Name: idx_upload_access_groups_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_access_groups_group_id ON public.upload_access_groups USING btree (group_id);


--
-- Name: idx_upload_access_groups_upload_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_access_groups_upload_id ON public.upload_access_groups USING btree (upload_id);


--
-- Name: idx_upload_permissions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_permissions_target ON public.upload_permissions USING btree (target_type, target_id);


--
-- Name: idx_upload_permissions_upload_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_permissions_upload_id ON public.upload_permissions USING btree (upload_id);


--
-- Name: idx_upload_share_links_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_share_links_active ON public.upload_share_links USING btree (upload_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_upload_share_links_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_share_links_token_hash ON public.upload_share_links USING btree (token_hash);


--
-- Name: idx_upload_share_links_upload_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_share_links_upload_id ON public.upload_share_links USING btree (upload_id);


--
-- Name: idx_user_group_members_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_group_members_group_id ON public.user_group_members USING btree (group_id);


--
-- Name: idx_user_group_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_group_members_user_id ON public.user_group_members USING btree (user_id);


--
-- Name: profiles_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_user_id_unique ON public.profiles USING btree (user_id);


--
-- Name: users_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_id_unique_idx ON public.users USING btree (id);


--
-- Name: access_rules access_rules_assigned_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_rules
    ADD CONSTRAINT access_rules_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subcategories subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: upload_access_groups upload_access_groups_assigned_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_access_groups
    ADD CONSTRAINT upload_access_groups_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: upload_access_groups upload_access_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_access_groups
    ADD CONSTRAINT upload_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: upload_permissions upload_permissions_assigned_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_permissions
    ADD CONSTRAINT upload_permissions_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_group_members user_group_members_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_group_fk FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

