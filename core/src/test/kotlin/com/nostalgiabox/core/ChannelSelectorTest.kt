package com.nostalgiabox.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class ChannelSelectorTest {

    private val fiveChannels = (1..5).map { unevenChannel(id = it) }
    private val selector = ChannelSelector(fiveChannels)

    @Test
    fun `next wraps past the last channel back to the first`() {
        assertEquals(2, selector.next(1).id)
        assertEquals(5, selector.next(4).id)
        assertEquals(1, selector.next(5).id, "the dial has no end")
    }

    @Test
    fun `previous wraps past the first channel back to the last`() {
        assertEquals(4, selector.previous(5).id)
        assertEquals(1, selector.previous(2).id)
        assertEquals(5, selector.previous(1).id, "the dial has no beginning either")
    }

    @Test
    fun `going all the way around in either direction returns to the start`() {
        var id = 1
        repeat(5) { id = selector.next(id).id }
        assertEquals(1, id, "five nexts across five channels is a full turn")

        repeat(5) { id = selector.previous(id).id }
        assertEquals(1, id, "five previouses across five channels is a full turn")

        // And next-then-previous is the identity from every position.
        fiveChannels.forEach { c ->
            assertEquals(c.id, selector.previous(selector.next(c.id).id).id)
            assertEquals(c.id, selector.next(selector.previous(c.id).id).id)
        }
    }

    @Test
    fun `the dial is ordered by sortOrder, not by declaration order`() {
        val shuffled = ChannelSelector(
            listOf(
                channel(id = 9, sortOrder = 3, files = listOf(file("x"))),
                channel(id = 2, sortOrder = 1, files = listOf(file("y"))),
                channel(id = 7, sortOrder = 2, files = listOf(file("z"))),
            ),
        )
        assertEquals(listOf(2, 7, 9), shuffled.channels.map { it.id })
        assertEquals(2, shuffled.firstChannel.id)
        assertEquals(2, shuffled.next(9).id, "wrap follows display order")
    }

    @Test
    fun `direct tune by number accepts what the remote actually sends`() {
        assertEquals(3, selector.byNumber("03")!!.id)
        assertEquals(3, selector.byNumber("3")!!.id, "a single keypress must find channel 03")
        assertEquals(3, selector.byNumber(" 3 ")!!.id)
        assertNull(selector.byNumber("42"), "an unassigned number stays where it is")
        assertNull(selector.byNumber(""))
    }

    @Test
    fun `channel zero is tunable if a manifest declares it`() {
        val withZero = ChannelSelector(
            listOf(
                channel(id = 1, number = "00", sortOrder = 0, files = listOf(file("a"))),
                channel(id = 2, number = "01", sortOrder = 1, files = listOf(file("b"))),
            ),
        )
        assertEquals(1, withZero.byNumber("0")!!.id)
        assertEquals(1, withZero.byNumber("00")!!.id)
    }

    @Test
    fun `lookup by stable id survives renumbering`() {
        assertEquals("04", selector.byId(4)!!.number)
        assertNull(selector.byId(99))
    }

    @Test
    fun `a channel removed by an update falls back to the first channel`() {
        assertEquals(1, selector.next(99).id)
        assertEquals(1, selector.previous(99).id)
    }

    @Test
    fun `a dial with no channels is rejected at construction`() {
        assertFailsWith<IllegalArgumentException> { ChannelSelector(emptyList()) }
    }

    @Test
    fun `a single channel dial wraps to itself`() {
        val one = ChannelSelector(listOf(unevenChannel(id = 1)))
        assertEquals(1, one.next(1).id)
        assertEquals(1, one.previous(1).id)
    }
}
