import { defineType, defineField } from "sanity";

export default defineType({
  name: "selection",
  title: "Selection",
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
      name: "photo",
      title: "Photo",
      type: "reference",
      to: [{ type: "photo" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "selectedAt",
      title: "Selected At",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: "notes",
      title: "Client Notes",
      type: "text",
      description: "Optional note from the client about this photo",
      validation: (Rule) => Rule.max(500),
    }),
    defineField({
      name: "photographerReply",
      title: "Photographer Reply",
      type: "text",
      description: "Photographer's response to the client's note",
      validation: (Rule) => Rule.max(500),
    }),
  ],
});
