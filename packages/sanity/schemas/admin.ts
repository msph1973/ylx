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
      // Deliberately NOT Rule.required(): invited vendors have no password
      // (Google-only login), so a required rule would block their docs.
      validation: (Rule) => Rule.min(8),
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
          { title: "Superadmin", value: "superadmin" },
          { title: "Vendor", value: "vendor" },
        ],
      },
      initialValue: "vendor",
      validation: (Rule) => Rule.required(),
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
    defineField({
      name: "brand",
      title: "Brand",
      type: "object",
      fields: [
        { name: "logoUrl", title: "Logo URL", type: "url" },
        { name: "accentColor", title: "Accent color", type: "string" },
      ],
    }),
    defineField({ name: "invitedBy", title: "Invited by", type: "string", hidden: true }),
    defineField({ name: "disabled", title: "Disabled", type: "boolean", initialValue: false }),
    defineField({
      name: "profileComplete",
      title: "Profile complete",
      description:
        "Set when the vendor saves their own display name (invited vendors start false and pick it after first Google login, never taken from the Google account).",
      type: "boolean",
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "email",
    },
  },
});
