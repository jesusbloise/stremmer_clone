import { NextResponse } from "next/server";
import pool from "@/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = String(
    searchParams.get("q") || ""
  ).trim();

  if (!q) {
    return NextResponse.json(
      {
        results: [],
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }

  try {
    const { rows } = await pool.query(
      `
      WITH base AS (
        SELECT
          u.id::text AS id,
          u.file_name,
          ft.titulo,

          COALESCE(
            NULLIF(ft.titulo, ''),
            u.file_name
          ) AS display_name,

          u.file_path,
          u.file_key,
          u.uploaded_at,
          u.category,
          u.subcategory,
          u.thumbnail_url,

          COALESCE(
            u.tipo,
            CASE
              WHEN lower(
                split_part(
                  u.file_name,
                  '.',
                  -1
                )
              ) IN (
                'mp4',
                'mov',
                'mkv',
                'webm',
                'm4v',
                'avi'
              )
              THEN 'video'

              WHEN lower(
                split_part(
                  u.file_name,
                  '.',
                  -1
                )
              ) IN (
                'pdf',
                'docx',
                'doc',
                'txt',
                'md',
                'csv',
                'log',
                'srt',
                'vtt'
              )
              THEN 'documento'

              ELSE 'desconocido'
            END
          ) AS tipo,

          /*
           * Texto correspondiente a la ficha.
           */
          lower(
            unaccent(
              concat_ws(
                ' ',
                u.file_name,
                ft.titulo,
                u.category,
                u.subcategory,
                ft.marca,
                ft.agencia,
                ft.productora,
                ft.productora_ficha,
                ft.contacto,
                ft.oficina,
                ft.estudio,
                ft.director,
                ft.productor,
                ft.produccion,
                ft.corporativo,
                ft.nuevos_negocios,
                array_to_string(
                  ft.tipo,
                  ' '
                )
              )
            )
          ) AS ficha_text

        FROM uploads u

        LEFT JOIN ficha_tecnica ft
          ON ft.upload_id::text =
            u.id::text

        WHERE
          u.is_deleted IS NOT TRUE
      ),

      subtitles AS (
        SELECT
          video_id::text AS id,

          string_agg(
            COALESCE(text, ''),
            ' '
            ORDER BY time_start
          ) AS subtitle_original,

          lower(
            unaccent(
              string_agg(
                COALESCE(text, ''),
                ' '
                ORDER BY time_start
              )
            )
          ) AS subtitle_text

        FROM video_subtitulos

        GROUP BY video_id::text
      ),

      documents AS (
        SELECT
          upload_id::text AS id,

          string_agg(
            COALESCE(texto_extraido, ''),
            ' '
          ) AS document_original,

          lower(
            unaccent(
              string_agg(
                COALESCE(texto_extraido, ''),
                ' '
              )
            )
          ) AS document_text

        FROM documentos_texto

        GROUP BY upload_id::text
      ),

      searchable AS (
        SELECT
          b.*,

          COALESCE(
            b.ficha_text,
            ''
          ) AS normalized_ficha,

          COALESCE(
            s.subtitle_text,
            ''
          ) AS normalized_subtitles,

          COALESCE(
            d.document_text,
            ''
          ) AS normalized_document,

          concat_ws(
            ' ',
            COALESCE(
              b.ficha_text,
              ''
            ),
            COALESCE(
              s.subtitle_text,
              ''
            ),
            COALESCE(
              d.document_text,
              ''
            )
          ) AS search_text,

          s.subtitle_original,
          d.document_original

        FROM base b

        LEFT JOIN subtitles s
          ON s.id = b.id

        LEFT JOIN documents d
          ON d.id = b.id
      ),

      filtered AS (
        SELECT
          s.*,

          /*
           * Identificamos aproximadamente
           * de dónde vino el resultado.
           *
           * Si las palabras están repartidas
           * entre varias fuentes usamos
           * "combinado".
           */
          CASE
            WHEN NOT EXISTS (
              SELECT 1

              FROM unnest(
                regexp_split_to_array(
                  trim(
                    lower(
                      unaccent($1)
                    )
                  ),
                  '[[:space:]]+'
                )
              ) AS token

              WHERE
                token <> ''

                AND s.normalized_ficha
                  NOT LIKE
                  '%' || token || '%'
            )
            THEN 'ficha'

            WHEN NOT EXISTS (
              SELECT 1

              FROM unnest(
                regexp_split_to_array(
                  trim(
                    lower(
                      unaccent($1)
                    )
                  ),
                  '[[:space:]]+'
                )
              ) AS token

              WHERE
                token <> ''

                AND s.normalized_subtitles
                  NOT LIKE
                  '%' || token || '%'
            )
            THEN 'subtitulos'

            WHEN NOT EXISTS (
              SELECT 1

              FROM unnest(
                regexp_split_to_array(
                  trim(
                    lower(
                      unaccent($1)
                    )
                  ),
                  '[[:space:]]+'
                )
              ) AS token

              WHERE
                token <> ''

                AND s.normalized_document
                  NOT LIKE
                  '%' || token || '%'
            )
            THEN 'documento'

            ELSE 'combinado'
          END AS matched_from

        FROM searchable s

        WHERE
          /*
           * Regla principal:
           *
           * TODAS las palabras buscadas
           * deben aparecer en alguna parte
           * del contenido del MISMO archivo.
           */
          NOT EXISTS (
            SELECT 1

            FROM unnest(
              regexp_split_to_array(
                trim(
                  lower(
                    unaccent($1)
                  )
                ),
                '[[:space:]]+'
              )
            ) AS token

            WHERE
              token <> ''

              AND s.search_text
                NOT LIKE
                '%' || token || '%'
          )
      )

      SELECT
        id,
        file_name,
        titulo,
        display_name,
        tipo,
        file_path,
        file_key,
        uploaded_at,
        category,
        subcategory,
        thumbnail_url,
        matched_from,

        CASE
          WHEN
            matched_from = 'subtitulos'
            OR matched_from = 'combinado'
          THEN
            LEFT(
              COALESCE(
                subtitle_original,
                display_name
              ),
              250
            )

          WHEN matched_from = 'documento'
          THEN
            LEFT(
              COALESCE(
                document_original,
                display_name
              ),
              250
            )

          ELSE
            display_name
        END AS snippet

      FROM filtered

      ORDER BY
        uploaded_at DESC

      LIMIT 100
      `,
      [q]
    );

    const results = rows.map(
      (r: any) => ({
        id: r.id,

        file_name:
          r.file_name ||
          "sin_nombre",

        display_name:
          r.display_name ||
          r.titulo ||
          r.file_name ||
          "sin_nombre",

        titulo:
          r.titulo || null,

        name:
          r.display_name ||
          r.titulo ||
          r.file_name ||
          "sin_nombre",

        file_path:
          r.file_path,

        file_key:
          r.file_key,

        url:
          r.file_path,

        tipo:
          r.tipo,

        category:
          r.category,

        subcategory:
          r.subcategory,

        thumbnail_url:
          r.thumbnail_url,

        matched_from:
          r.matched_from,

        subtituloTexto:
          (
            r.snippet || ""
          ).trim(),

        uploaded_at:
          r.uploaded_at,
      })
    );

    return NextResponse.json(
      {
        results,
      },
      {
        headers: {
          "cache-control":
            "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error(
      "Error en /api/buscar:",
      e?.message || e
    );

    return NextResponse.json(
      {
        error: "Error interno",
      },
      {
        status: 500,
      }
    );
  }
}