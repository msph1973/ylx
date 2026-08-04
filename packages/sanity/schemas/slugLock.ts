import { defineType, defineField } from "sanity";

/**
 * Internal reservation record used to make album slug/customSlug uniqueness
 * checks atomic. Its `_id` is deterministically derived from the slug value
 * (`slugLock.<slug>`, see `apps/web/src/lib/slug.ts`), so Sanity's own
 * document-ID uniqueness guarantee — an ordinary `.create()` fails with a
 * 409 if the ID already exists — is reused as a race-free "reserve this
 * slug" primitive, something Sanity has no native field-level equivalent
 * for. Not meant to be created or edited by hand in the Studio.
 */
export default defineType({
  name: "slugLock",
  title: "Slug Lock (internal)",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      title: "Slug",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "albumId",
      title: "Album ID",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: { title: "slug", subtitle: "albumId" },
  },
});
