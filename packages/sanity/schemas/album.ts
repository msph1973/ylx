import { defineType, defineField } from "sanity";

export default defineType({
  name: "album",
  title: "Album",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "clientName",
      title: "Client Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "eventDate",
      title: "Event Date",
      type: "date",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "pin",
      title: "PIN",
      type: "string",
      validation: (Rule) =>
        Rule.required().custom((value) => {
          if (!value) return true; // required() handles empty
          return /^\d{4}$/.test(value) || "PIN must be exactly 4 digits (numbers only)";
        }),
    }),
    defineField({
      name: "maxSelections",
      title: "Maximum Selections",
      type: "number",
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Active", value: "active" },
          { title: "Submitted", value: "submitted" },
          { title: "Locked", value: "locked" },
        ],
      },
      initialValue: "active",
    }),
    defineField({
      name: "photos",
      title: "Photos",
      type: "array",
      of: [{ type: "reference", to: [{ type: "photo" }] }],
    }),
  ],
  preview: {
    select: {
      title: "title",
      clientName: "clientName",
      eventDate: "eventDate",
    },
    prepare({ title, clientName, eventDate }) {
      return {
        title,
        subtitle: `${clientName} - ${eventDate}`,
      };
    },
  },
});
