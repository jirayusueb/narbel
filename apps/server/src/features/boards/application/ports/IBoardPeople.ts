/** Who owns an email address: identity answers, boards never reads its tables. */
export interface IBoardPeople {
  findByEmails(
    emails: string[]
  ): Promise<{ id: string; email: string; name: string }[]>;
}
