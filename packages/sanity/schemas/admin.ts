import { defineType, defineField } from "sanity";

export default defineType({
  name: "admin",
  title: "Admin",
  type: "document",
  fields: [
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "password",
      title: "Password",
      type: "string",
      validation: (Rule) => Rule.required().min(8),
      hidden: true,
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "role",
      title: "Role",
      type: "string",
      options: {
        list: [
          { title: "Admin", value: "admin" },
          { title: "Photographer", value: "photographer" },
        ],
      },
      initialValue: "photographer",
    }),
    defineField({
      name: "sessionVersion",
      title: "Session Version",
      description:
        "Incremented on every logout (and future password change) to revoke all previously issued session cookies signed with an older version.",
      type: "number",
      initialValue: 0,
      readOnly: true,
      hidden: true,
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "email",
    },
  },
});
