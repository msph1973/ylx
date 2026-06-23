import { defineType, defineField } from "sanity";

export default defineType({
  name: "submission",
  title: "Submission",
  type: "document",
  fields: [
    defineField({
      name: "album",
      title: "Album",
      type: "reference",
      to: [{ type: "album" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "selections",
      title: "Selections",
      type: "array",
      of: [{ type: "reference", to: [{ type: "selection" }] }],
    }),
    defineField({
      name: "submittedAt",
      title: "Submitted At",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
    }),
  ],
});
